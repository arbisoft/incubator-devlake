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

using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Audit;

public sealed class AuditTrail : IAuditTrail
{
    /// <summary>The longest field value kept in an entry's changes; a longer one is cut short and ends with an ellipsis.</summary>
    public const int MaxValueLength = 1000;

    private const int MaxNameLength = 255;
    private const int MaxEntityIdLength = 100;
    private const int MaxReasonLength = 500;
    private const int MaxIpAddressLength = 45;

    private static readonly JsonSerializerOptions ChangesJson = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingDefault
    };

    private readonly IAuditLogRepository _auditLogs;
    private readonly TimeProvider _timeProvider;

    public AuditTrail(IAuditLogRepository auditLogs, TimeProvider timeProvider)
    {
        _auditLogs = auditLogs;
        _timeProvider = timeProvider;
    }

    public async Task RecordAsync(AuditActor actor, AuditEntry entry, CancellationToken cancellationToken)
    {
        var log = new AuditLog
        {
            OccurredOn = _timeProvider.GetUtcNow(),
            ActorKind = actor.Kind,
            ActorId = Cut(actor.Id, MaxNameLength),
            ActorName = Cut(actor.Name, MaxNameLength) ?? string.Empty,
            Action = entry.Action,
            EntityType = entry.EntityType,
            EntityId = Cut(entry.EntityId, MaxEntityIdLength) ?? string.Empty,
            EntityLabel = Cut(entry.EntityLabel, MaxNameLength),
            Changes = Serialize(entry.Changes),
            Reason = Cut(entry.Reason, MaxReasonLength),
            IpAddress = Cut(entry.IpAddress, MaxIpAddressLength),
            TraceId = Activity.Current?.TraceId.ToHexString()
        };
        await _auditLogs.InsertAsync(log, cancellationToken);
    }

    /// <summary>Reads back the changes of a stored entry. An entry without changes, or with JSON this service did not write, gives none.</summary>
    public static IReadOnlyList<AuditChange> ReadChanges(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<AuditChange>>(json, ChangesJson) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static string? Serialize(IReadOnlyList<AuditChange>? changes)
    {
        if (changes is null || changes.Count == 0)
        {
            return null;
        }

        var kept = changes.Select(change => change.Hidden
            ? change with { Old = null, New = null }
            : change with { Old = Cut(change.Old, MaxValueLength), New = Cut(change.New, MaxValueLength) });
        return JsonSerializer.Serialize(kept, ChangesJson);
    }

    private static string? Cut(string? value, int maxLength) =>
        value is null || value.Length <= maxLength ? value : string.Concat(value.AsSpan(0, maxLength - 1), "…");
}
