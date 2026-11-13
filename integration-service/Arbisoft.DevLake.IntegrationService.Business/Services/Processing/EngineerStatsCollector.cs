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
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis.DevLake;
using Microsoft.Extensions.Logging;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Processing;

public sealed class EngineerStatsCollector : IEngineerStatsCollector
{
    private static readonly DevLakeStatsSource[] Sources = [DevLakeStatsSource.Jira, DevLakeStatsSource.Github, DevLakeStatsSource.AiUsage, DevLakeStatsSource.AiCost];

    private readonly IDevLakeClient _devLake;
    private readonly ILogger<EngineerStatsCollector> _logger;

    public EngineerStatsCollector(IDevLakeClient devLake, ILogger<EngineerStatsCollector> logger)
    {
        _devLake = devLake;
        _logger = logger;
    }

    public async Task<EmployeeStatsDto> CollectAsync(
        string arbisoftEmail, IReadOnlyList<string> mappedEmails, StatsQuery query, string correlationId, CancellationToken cancellationToken)
    {
        var mapped = mappedEmails
            .Select(EmailNormalizer.Canonical)
            .Where(email => !string.Equals(email, arbisoftEmail, StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var emails = new[] { arbisoftEmail }.Concat(mapped).ToList();

        var calls = emails.SelectMany(email => Sources.Select(source => CallAsync(source, email, query, correlationId, cancellationToken))).ToList();
        await UpstreamFailures.AwaitAllAsync(calls);
        var results = calls.Select(call => call.Result).ToList();

        IReadOnlyDictionary<string, JsonElement> Of(DevLakeStatsSource source) => results
            .Where(result => result.Source == source && result.Stats is not null)
            .ToDictionary(result => result.Email, result => result.Stats!.Value, StringComparer.OrdinalIgnoreCase);

        var errors = results
            .Where(result => result.Error is not null)
            .Select(result => new StatsErrorDto(DevLakeClient.PathOf(result.Source), result.Email, result.Error!.StatusCode, result.Error.Message))
            .ToList();

        return new EmployeeStatsDto(
            arbisoftEmail, mapped, Of(DevLakeStatsSource.Jira), Of(DevLakeStatsSource.Github), Of(DevLakeStatsSource.AiUsage), Of(DevLakeStatsSource.AiCost), errors);
    }

    /// <summary>One call. A refusal that concerns this email and source only is kept as its result; anything systemic is thrown.</summary>
    private async Task<CallResult> CallAsync(DevLakeStatsSource source, string email, StatsQuery query, string correlationId, CancellationToken cancellationToken)
    {
        try
        {
            return new CallResult(source, email, await _devLake.GetStatsAsync(source, email, query, correlationId, cancellationToken), null);
        }
        catch (ExternalApiException exception) when (exception is ExternalApiRejectedException or ExternalApiResponseException)
        {
            _logger.LogWarning(
                "Request {CorrelationId}: DevLake refused the {Source} stats of one email; the others are still delivered: {Problem}",
                correlationId,
                DevLakeClient.PathOf(source),
                exception.Message);
            return new CallResult(source, email, null, exception);
        }
    }

    private sealed record CallResult(DevLakeStatsSource Source, string Email, JsonElement? Stats, ExternalApiException? Error);
}
