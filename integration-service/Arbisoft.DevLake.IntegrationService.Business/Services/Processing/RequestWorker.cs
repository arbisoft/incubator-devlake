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
using Arbisoft.DevLake.IntegrationService.Business.Services.Requests;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis.Sophia;
using Arbisoft.DevLake.IntegrationService.DataAccess.Messaging;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Processing;

public sealed class RequestWorker : IRequestWorker
{
    private readonly IRequestLogRepository _requestLogs;
    private readonly IEmailMappingRepository _mappings;
    private readonly ICallbackAvailability _callbacks;
    private readonly ISophiaClient _sophia;
    private readonly IEngineerStatsCollector _collector;
    private readonly ICallbackDelivery _delivery;
    private readonly IRequestAttemptLog _attempts;
    private readonly ProcessingOptions _options;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<RequestWorker> _logger;

    public RequestWorker(
        IRequestLogRepository requestLogs,
        IEmailMappingRepository mappings,
        ICallbackAvailability callbacks,
        ISophiaClient sophia,
        IEngineerStatsCollector collector,
        ICallbackDelivery delivery,
        IRequestAttemptLog attempts,
        IOptions<ProcessingOptions> options,
        TimeProvider timeProvider,
        ILogger<RequestWorker> logger)
    {
        _requestLogs = requestLogs;
        _mappings = mappings;
        _callbacks = callbacks;
        _sophia = sophia;
        _collector = collector;
        _delivery = delivery;
        _attempts = attempts;
        _options = options.Value;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task<WorkResult> HandleMessageAsync(QueueDelivery delivery, ProcessingRun run, CancellationToken stopping)
    {
        var correlationId = delivery.Message.CorrelationId;
        if (delivery.Rejection is { } rejection)
        {
            await FailRejectedAsync(correlationId, rejection);
            return WorkResult.DeadLettered;
        }

        var request = await _requestLogs.GetByCorrelationIdAsync(correlationId, stopping);
        if (request is null)
        {
            // The API commits the log before it publishes, so a message without one did not come from this service's intake and can never succeed.
            _logger.LogError("Request {CorrelationId} has no log row and is moved to the dead-letter queue", correlationId);
            return WorkResult.DeadLettered;
        }

        if (IsFinished(request.Status))
        {
            _logger.LogInformation("Request {CorrelationId} was already finished; acknowledging the repeat delivery", correlationId);
            return WorkResult.Acknowledged;
        }

        if (!await TryClaimAsync(request, stopping))
        {
            // Another worker holds it, or it is deferred: the database owns it either way, so this copy of the message is not needed.
            _logger.LogInformation("Request {CorrelationId} is already owned by the processing job; acknowledging the extra message", correlationId);
            return WorkResult.Acknowledged;
        }

        return new WorkResult(MessageOutcome.Ack, await WorkClaimedAsync(request, run, stopping));
    }

    public async Task<StepResult> HandleDueAsync(RequestLog request, ProcessingRun run, CancellationToken stopping)
    {
        return await TryClaimAsync(request, stopping) ? await WorkClaimedAsync(request, run, stopping) : StepResult.Skipped;
    }

    private async Task<bool> TryClaimAsync(RequestLog request, CancellationToken stopping)
    {
        var now = _timeProvider.GetUtcNow();
        return await _requestLogs.TryClaimAsync(request.Id, now, now.AddSeconds(_options.ClaimLeaseSeconds), stopping);
    }

    /// <summary>A shutdown in the middle of a step hands the request straight back, due at once, instead of leaving it until its lease runs out.</summary>
    private async Task<StepResult> WorkClaimedAsync(RequestLog request, ProcessingRun run, CancellationToken stopping)
    {
        try
        {
            return await StepAsync(request, run, stopping);
        }
        catch (OperationCanceledException) when (stopping.IsCancellationRequested)
        {
            var payload = await _requestLogs.GetPayloadAsync(request.Id, CancellationToken.None);
            await DeferAsync(request, payload is null ? RequestStatus.Queued : RequestStatus.Processing, TimeSpan.Zero);
            return StepResult.Deferred;
        }
    }

    private async Task<StepResult> StepAsync(RequestLog request, ProcessingRun run, CancellationToken stopping)
    {
        var body = await _requestLogs.GetJsonAsync(request.Id, stopping);
        if (body is null)
        {
            return await FailAsync(request, "The request has no stored body.");
        }

        if (!QueuedRequestReader.TryRead(body, out var readable, out var problem))
        {
            return await FailAsync(request, problem!);
        }

        if (!await _callbacks.IsAvailableAsync(request.ClientRefId, request.EventType, stopping))
        {
            _logger.LogWarning("Request {CorrelationId} revoked: its callback URL was removed while it waited", request.CorrelationId);
            return await FinishAsync(request, RequestStatus.RevokedNoCallbackUrl);
        }

        var payload = await _requestLogs.GetPayloadAsync(request.Id, stopping);
        if (run.IsClientFailing(request.ClientRefId))
        {
            return await DeferUnavailableAsync(request, payload);
        }

        if (payload is null)
        {
            var collected = await CollectAsync(request, readable!, run, stopping);
            if (collected.Result is { } result)
            {
                return result;
            }

            payload = collected.Payload!;
            await _requestLogs.SavePayloadAsync(request.Id, payload, _timeProvider.GetUtcNow(), CancellationToken.None);
        }

        return await DeliverAsync(request, payload, run);
    }

    /// <summary>
    /// Checks the client's credentials first, so a client whose credentials are refused costs DevLake nothing; then collects. DevLake down or refusing
    /// our token stops the run; DevLake refusing the request itself fails only this request.
    /// </summary>
    private async Task<Collected> CollectAsync(RequestLog request, ReadableRequest readable, ProcessingRun run, CancellationToken stopping)
    {
        if (run.HaltReason is not null)
        {
            return new Collected(null, await DeferUnavailableAsync(request, payload: null));
        }

        try
        {
            await _sophia.EnsureAccessTokenAsync(request.ClientRefId, request.CorrelationId, stopping);
        }
        catch (CallbackNotConfiguredException)
        {
            return new Collected(null, await FinishAsync(request, RequestStatus.RevokedNoCallbackUrl));
        }
        catch (ExternalApiException exception)
        {
            _logger.LogError("Request {CorrelationId} deferred: no Sophia access token for its client: {Problem}", request.CorrelationId, exception.Message);
            run.MarkClientFailing(request.ClientRefId);
            return new Collected(null, await DeferUnavailableAsync(request, payload: null));
        }

        try
        {
            return new Collected(await BuildPayloadAsync(request.CorrelationId, readable, stopping), null);
        }
        catch (Exception exception) when (exception is ExternalAuthenticationException or ExternalApiUnavailableException)
        {
            _logger.LogWarning("Request {CorrelationId} could not be collected now: {Problem}", request.CorrelationId, exception.Message);
            run.Halt($"DevLake failed during the run: {exception.Message}");
            return new Collected(null, await DeferUnavailableAsync(request, payload: null));
        }
        catch (ExternalApiException exception)
        {
            return new Collected(null, await FailAsync(request, exception.Message));
        }
    }

    private async Task<StepResult> DeliverAsync(RequestLog request, string payload, ProcessingRun run)
    {
        var attempt = await _delivery.AttemptAsync(request, payload);
        switch (attempt.Outcome)
        {
            case DeliveryOutcome.Delivered:
                return await FinishAsync(request, RequestStatus.Success);
            case DeliveryOutcome.Revoked:
                return await FinishAsync(request, RequestStatus.RevokedNoCallbackUrl);
            case DeliveryOutcome.CredentialsRefused:
                run.MarkClientFailing(request.ClientRefId);
                return await DeferUnavailableAsync(request, payload);
            case DeliveryOutcome.Rejected:
                return await FinishAsync(request, RequestStatus.Failed);
        }

        if (attempt.AttemptsUsedUp)
        {
            _logger.LogWarning("Request {CorrelationId} failed: {Attempts} delivery attempts did not succeed", request.CorrelationId, attempt.FailedAttempts);
            return await FinishAsync(request, RequestStatus.Failed);
        }

        var delay = RetryDelays.ForDelivery(attempt.FailedAttempts, _options, attempt.RetryAfter);
        _logger.LogInformation(
            "Request {CorrelationId}: delivery attempt {Attempt} failed; the next is due in {Delay}", request.CorrelationId, attempt.FailedAttempts, delay);
        await DeferAsync(request, RequestStatus.Processing, delay);
        return StepResult.Deferred;
    }

    private async Task<string> BuildPayloadAsync(string correlationId, ReadableRequest readable, CancellationToken stopping)
    {
        // The database is used one call at a time, here, before anything runs in parallel: a scope's connection must never be shared between tasks (DAT-16).
        var engineers = new List<(string Email, IReadOnlyList<string> Mapped)>();
        foreach (var email in readable.Request.Emails)
        {
            engineers.Add((email, await _mappings.GetMappedEmailsAsync(email, stopping)));
        }

        var collections = engineers.Select(engineer => _collector.CollectAsync(engineer.Email, engineer.Mapped, readable.Query, correlationId, stopping)).ToList();
        await UpstreamFailures.AwaitAllAsync(collections);

        var request = readable.Request;
        var payload = new CallbackPayload(correlationId, collections.Select(task => task.Result).ToList(), request.TimeFrame, request.From, request.To);
        return JsonSerializer.Serialize(payload);
    }

    /// <summary>A message the consumer refused. Its request, if one can be found, ends Failed with the reason, so polling does not say Queued until it expires.</summary>
    private async Task FailRejectedAsync(string correlationId, string rejection)
    {
        _logger.LogError("Request {CorrelationId} is moved to the dead-letter queue: {Problem}", correlationId, rejection);
        var request = string.IsNullOrEmpty(correlationId) ? null : await _requestLogs.GetByCorrelationIdAsync(correlationId, CancellationToken.None);
        if (request is not null && !IsFinished(request.Status))
        {
            await _attempts.RecordAsync(request.Id, DeliveryAttemptStatus.FetchFailed, ProcessingConstants.EmptyJson, rejection, CancellationToken.None);
            await FinishAsync(request, RequestStatus.Failed);
        }
    }

    private async Task<StepResult> FailAsync(RequestLog request, string reason)
    {
        _logger.LogWarning("Request {CorrelationId} failed: {Reason}", request.CorrelationId, reason);
        await _attempts.RecordAsync(request.Id, DeliveryAttemptStatus.FetchFailed, ProcessingConstants.EmptyJson, reason, CancellationToken.None);
        return await FinishAsync(request, RequestStatus.Failed);
    }

    /// <summary>Ends the request and drops its stored callback body, which holds engineers' data and is not needed once nothing more will be sent.</summary>
    private async Task<StepResult> FinishAsync(RequestLog request, string status)
    {
        await _requestLogs.UpdateStatusAsync(request.Id, status, CancellationToken.None);
        await _requestLogs.DeletePayloadAsync(request.Id, CancellationToken.None);
        return StepResult.Finished;
    }

    /// <summary>Waits for DevLake or the client's credentials. A request with nothing collected yet shows as Queued; one with its result in hand, as Processing.</summary>
    private async Task<StepResult> DeferUnavailableAsync(RequestLog request, string? payload)
    {
        await DeferAsync(request, payload is null ? RequestStatus.Queued : RequestStatus.Processing, RetryDelays.ForUnavailable(_options));
        return StepResult.Deferred;
    }

    private Task DeferAsync(RequestLog request, string status, TimeSpan delay)
    {
        return _requestLogs.DeferAsync(request.Id, status, _timeProvider.GetUtcNow() + delay, CancellationToken.None);
    }

    private static bool IsFinished(string status) => status is RequestStatus.Success or RequestStatus.Failed or RequestStatus.RevokedNoCallbackUrl;

    /// <summary>Either the collected callback body, or the step's result when collecting ended the step.</summary>
    private sealed record Collected(string? Payload, StepResult? Result);
}
