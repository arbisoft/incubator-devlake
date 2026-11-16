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

using Arbisoft.DevLake.IntegrationService.Business.Services.Requests;
using Arbisoft.DevLake.IntegrationService.DataAccess.Messaging;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Options;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Processing;

public sealed class ReceivedRequestRelay : IReceivedRequestRelay
{
    private const int BatchSize = 100;
    private const string MissingBody = "The request has no stored body, so it cannot be queued.";

    private readonly IRequestLogRepository _requestLogs;
    private readonly IRequestStatusTransitions _transitions;
    private readonly IRequestQueuePublisher _publisher;
    private readonly IRequestAttemptLog _attempts;
    private readonly ProcessingOptions _processing;
    private readonly RabbitMqOptions _rabbitMq;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<ReceivedRequestRelay> _logger;

    public ReceivedRequestRelay(
        IRequestLogRepository requestLogs,
        IRequestStatusTransitions transitions,
        IRequestQueuePublisher publisher,
        IRequestAttemptLog attempts,
        IOptions<ProcessingOptions> processing,
        IOptions<RabbitMqOptions> rabbitMq,
        TimeProvider timeProvider,
        ILogger<ReceivedRequestRelay> logger)
    {
        _requestLogs = requestLogs;
        _transitions = transitions;
        _publisher = publisher;
        _attempts = attempts;
        _processing = processing.Value;
        _rabbitMq = rabbitMq.Value;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task<int> RelayAsync(CancellationToken cancellationToken)
    {
        var now = _timeProvider.GetUtcNow();
        var stuck = await _requestLogs.ListByStatusCreatedBetweenAsync(
            RequestStatus.Received,
            now.AddSeconds(-_rabbitMq.MessageTtlSeconds),
            now.AddSeconds(-_processing.RepublishAfterSeconds),
            BatchSize,
            cancellationToken);

        var relayed = 0;
        foreach (var request in stuck)
        {
            var body = await _requestLogs.GetJsonAsync(request.Id, cancellationToken);
            if (body is null)
            {
                await FailAsync(RequestKey.Of(request));
                continue;
            }

            try
            {
                await _publisher.PublishAsync(new QueueMessage(request.CorrelationId, request.EventType, body), cancellationToken);
            }
            catch (Exception exception) when (exception is QueueFullException or QueueUnavailableException)
            {
                _logger.LogWarning("Stopped republishing recorded requests: {Problem}", exception.Message);
                break;
            }

            await _transitions.TryChangeAsync(
                RequestKey.Of(request), RequestStatus.Received, new StatusChange(RequestStatus.Queued, StatusReasons.Republished), CancellationToken.None);
            _logger.LogWarning("Request {CorrelationId} was recorded but never queued; it has been published again", request.CorrelationId);
            relayed++;
        }

        return relayed;
    }

    private async Task FailAsync(RequestKey request)
    {
        _logger.LogError("Request {CorrelationId} was recorded without a body and is marked failed", request.CorrelationId);
        var failed = new StatusChange(RequestStatus.Failed, StatusReasons.MissingBody);
        if (await _transitions.TryChangeAsync(request, RequestStatus.Received, failed, CancellationToken.None))
        {
            await _attempts.RecordAsync(request.Id, DeliveryAttemptStatus.PublishFailed, ProcessingConstants.EmptyJson, MissingBody, CancellationToken.None);
        }
    }
}
