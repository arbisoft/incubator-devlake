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

using System.Net;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis.Sophia;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.Extensions.Logging;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Processing;

public sealed class CallbackDelivery : ICallbackDelivery
{
    private readonly ISophiaClient _sophia;
    private readonly IClientConfigRepository _configs;
    private readonly IRequestAttemptLog _attempts;
    private readonly ILogger<CallbackDelivery> _logger;

    public CallbackDelivery(ISophiaClient sophia, IClientConfigRepository configs, IRequestAttemptLog attempts, ILogger<CallbackDelivery> logger)
    {
        _sophia = sophia;
        _configs = configs;
        _attempts = attempts;
        _logger = logger;
    }

    public async Task<DeliveryAttempt> AttemptAsync(RequestLog request, string payloadJson)
    {
        var config = await _configs.GetByClientRefIdAsync(request.ClientRefId, CancellationToken.None);
        if (config is not { IsActive: true })
        {
            return new DeliveryAttempt(DeliveryOutcome.Revoked);
        }

        var failed = await _attempts.CountDeliveryAttemptsAsync(request.Id, request.QueuedOn ?? request.CreatedOn, CancellationToken.None);
        if (failed >= config.MaxAttempts)
        {
            return new DeliveryAttempt(DeliveryOutcome.Failed, failed, AttemptsUsedUp: true);
        }

        try
        {
            var result = await _sophia.PostCallbackAsync(request.ClientRefId, request.EventType, payloadJson, request.CorrelationId, CancellationToken.None);
            await _attempts.RecordAsync(
                request.Id,
                result.Delivered ? DeliveryAttemptStatus.Delivered : DeliveryAttemptStatus.DeliveryFailed,
                result.ResponseBody,
                result.Delivered ? null : $"HTTP {result.StatusCode}",
                CancellationToken.None);
            if (result.Delivered)
            {
                return new DeliveryAttempt(DeliveryOutcome.Delivered);
            }

            if (!IsWorthRetrying(result.StatusCode))
            {
                _logger.LogWarning("Request {CorrelationId}: the callback refused the result with {Status}; it is not retried", request.CorrelationId, result.StatusCode);
                return new DeliveryAttempt(DeliveryOutcome.Rejected, failed + 1);
            }

            return Failed(failed + 1, config.MaxAttempts) with { RetryAfter = result.RetryAfter };
        }
        catch (CallbackNotConfiguredException)
        {
            _logger.LogWarning("Request {CorrelationId}: the callback was removed while it was being delivered", request.CorrelationId);
            return new DeliveryAttempt(DeliveryOutcome.Revoked);
        }
        catch (ExternalAuthenticationException exception)
        {
            _logger.LogError("Request {CorrelationId}: Sophia refused our credentials: {Problem}", request.CorrelationId, exception.Message);
            return new DeliveryAttempt(DeliveryOutcome.CredentialsRefused);
        }
        catch (ExternalApiUnavailableException exception)
        {
            await _attempts.RecordAsync(request.Id, DeliveryAttemptStatus.DeliveryFailed, ProcessingConstants.EmptyJson, exception.Message, CancellationToken.None);
            return Failed(failed + 1, config.MaxAttempts);
        }
    }

    /// <summary>
    /// A timeout (408), being told to slow down (429) or a server error (5xx) may pass. Any other 4xx means the callback refuses this result, and
    /// sending the same body again cannot change that. 401 and 403 never get here: they are a credentials problem for the whole client.
    /// </summary>
    private static bool IsWorthRetrying(int statusCode) =>
        statusCode is (int)HttpStatusCode.RequestTimeout or (int)HttpStatusCode.TooManyRequests or >= 500 || statusCode < 400;

    private static DeliveryAttempt Failed(int failedAttempts, int maxAttempts) =>
        new(DeliveryOutcome.Failed, failedAttempts, AttemptsUsedUp: failedAttempts >= maxAttempts);
}
