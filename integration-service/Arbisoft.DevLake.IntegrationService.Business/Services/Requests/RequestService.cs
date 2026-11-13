// Licensed to the Apache Software Foundation (ASF) under one or more
// contributor license agreements.  See the NOTICE file distributed with
// this work for additional information regarding copyright ownership.
// The ASF licenses this file to You under the Apache License, Version 2.0
// (the "License"); you may not use this file except in compliance with
// the License.  You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

using System.Text.Json;
using Arbisoft.DevLake.IntegrationService.Business.Dtos.Stats;
using Arbisoft.DevLake.IntegrationService.Business.Services.Processing;
using Arbisoft.DevLake.IntegrationService.DataAccess.Messaging;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Persistence;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.Extensions.Logging;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Requests;

public sealed class RequestService : IRequestService
{
    private const int MaxConflictRetries = 3;
    private const string AttemptBy = "RequestIntake";

    private readonly IRequestLogRepository _requestLogs;
    private readonly ICallbackAvailability _callbacks;
    private readonly IRequestQueuePublisher _publisher;
    private readonly IDbSession _session;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<RequestService> _logger;

    public RequestService(
        IRequestLogRepository requestLogs,
        ICallbackAvailability callbacks,
        IRequestQueuePublisher publisher,
        IDbSession session,
        TimeProvider timeProvider,
        ILogger<RequestService> logger)
    {
        _requestLogs = requestLogs;
        _callbacks = callbacks;
        _publisher = publisher;
        _session = session;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task<SubmissionResult> SubmitAsync(RequestSubmission submission, CancellationToken cancellationToken)
    {
        var correlationId = Guid.NewGuid().ToString("D");
        var body = JsonSerializer.Serialize(ToBody(correlationId, submission));

        if (!await _callbacks.IsAvailableAsync(submission.ClientRefId, submission.EventType, cancellationToken))
        {
            await RecordRevokedAsync(submission, correlationId, body, cancellationToken);
            return new SubmissionResult(SubmissionOutcome.NoCallbackUrl, correlationId);
        }

        for (var attempt = 1; attempt <= MaxConflictRetries; attempt++)
        {
            if (await TryQueueAsync(submission, correlationId, body, cancellationToken))
            {
                _logger.LogInformation("Queued request {CorrelationId} for {Count} email(s)", correlationId, submission.Emails.Count);
                return new SubmissionResult(SubmissionOutcome.Queued, correlationId);
            }

            var winner = await _requestLogs.GetByIdempotencyKeyAsync(submission.IdempotencyKey, cancellationToken);
            if (winner is not null)
            {
                _logger.LogInformation("Request matched {CorrelationId} while it was being queued", winner.CorrelationId);
                return new SubmissionResult(SubmissionOutcome.Duplicate, winner.CorrelationId);
            }
        }

        throw new InvalidOperationException("The request could not be queued because its idempotency key kept changing hands.");
    }

    private QueuedStatsRequest ToBody(string correlationId, RequestSubmission submission)
    {
        var period = submission.Period;
        return new QueuedStatsRequest(
            correlationId,
            submission.EventType,
            submission.Emails,
            _timeProvider.GetUtcNow(),
            period.TimeFrame?.Text,
            period.From is { } from ? StatsPeriod.FormatInstant(from) : null,
            period.To is { } to ? StatsPeriod.FormatInstant(to) : null);
    }

    /// <summary>
    /// Commits the log and the body as Received first, then publishes, then marks the request Queued: the row always exists before its message
    /// does, so the processing job never meets a message without a row. A request that loses a race on the unique idempotency key stops before it
    /// publishes. Once the row is committed the caller disconnecting no longer matters: the publish (bounded by its own timeout) and the status
    /// change run to the end. If the process stops between the commit and the publish, the processing job republishes the Received row.
    /// </summary>
    private async Task<bool> TryQueueAsync(RequestSubmission submission, string correlationId, string body, CancellationToken cancellationToken)
    {
        var id = await TryRecordAsync(submission, correlationId, body, cancellationToken);
        if (id is null)
        {
            return false;
        }

        // Waiting on the broker must not hold a database connection: a broker that blocks publishers would otherwise drain the pool.
        await _session.ReleaseConnectionAsync();
        try
        {
            await _publisher.PublishAsync(new QueueMessage(correlationId, submission.EventType, body), CancellationToken.None);
        }
        catch (Exception exception) when (exception is QueueFullException or QueueUnavailableException)
        {
            await RecordPublishFailureAsync(id.Value, correlationId, exception);
            throw;
        }

        // Only from Received: the processing job may already have taken the message and moved the request on.
        await _requestLogs.TryChangeStatusAsync(id.Value, RequestStatus.Received, RequestStatus.Queued, CancellationToken.None);
        return true;
    }

    private async Task<long?> TryRecordAsync(RequestSubmission submission, string correlationId, string body, CancellationToken cancellationToken)
    {
        // A failure before the commit leaves the transaction open; disposing the session at the end of the request rolls it back.
        await _session.BeginTransactionAsync(cancellationToken);
        var id = await _requestLogs.TryInsertAsync(NewLog(submission, correlationId, RequestStatus.Received, submission.IdempotencyKey), cancellationToken);
        if (id is null)
        {
            await _session.RollbackAsync(cancellationToken);
            return null;
        }

        await _requestLogs.InsertJsonAsync(new RequestLogJson { RequestLogId = id.Value, Json = body }, cancellationToken);
        await _session.CommitAsync(cancellationToken);
        return id;
    }

    /// <summary>
    /// The request was refused by the queue, so it will never be processed: it ends Failed with the reason, and gives up its idempotency key so the
    /// client's retry is queued. If a publish that timed out did reach the queue, the processing job finds the request Failed and drops the message.
    /// </summary>
    private async Task RecordPublishFailureAsync(long id, string correlationId, Exception exception)
    {
        _logger.LogWarning("Request {CorrelationId} could not be queued: {Problem}", correlationId, exception.Message);
        if (!await _requestLogs.TryChangeStatusAsync(id, RequestStatus.Received, RequestStatus.Failed, CancellationToken.None))
        {
            return;
        }

        await _requestLogs.ReleaseIdempotencyKeyAsync(id, CancellationToken.None);
        await _requestLogs.InsertAttemptAsync(
            new RequestResponseAttempt
            {
                RequestLogId = id,
                ResponseJson = ProcessingConstants.EmptyJson,
                AttemptStatus = DeliveryAttemptStatus.PublishFailed,
                FailureError = exception.Message,
                AttemptBy = AttemptBy,
                AttemptOn = _timeProvider.GetUtcNow()
            },
            CancellationToken.None);
    }

    /// <summary>A revoked request is final and holds no idempotency key, so the client can send it again once a callback URL exists.</summary>
    private async Task RecordRevokedAsync(RequestSubmission submission, string correlationId, string body, CancellationToken cancellationToken)
    {
        await _session.BeginTransactionAsync(cancellationToken);
        var id = await _requestLogs.InsertAsync(NewLog(submission, correlationId, RequestStatus.RevokedNoCallbackUrl, idempotencyKey: null), cancellationToken);
        await _requestLogs.InsertJsonAsync(new RequestLogJson { RequestLogId = id, Json = body }, cancellationToken);
        await _session.CommitAsync(cancellationToken);
        _logger.LogWarning("Request {CorrelationId} revoked: client {ClientRefId} has no active callback URL for {EventType}", correlationId, submission.ClientRefId, submission.EventType);
    }

    private RequestLog NewLog(RequestSubmission submission, string correlationId, string status, string? idempotencyKey) => new()
    {
        ClientRefId = submission.ClientRefId,
        CorrelationId = correlationId,
        Url = submission.RequestUrl,
        Status = status,
        EventType = submission.EventType,
        CreatedOn = _timeProvider.GetUtcNow(),
        IdempotencyKey = idempotencyKey
    };
}
