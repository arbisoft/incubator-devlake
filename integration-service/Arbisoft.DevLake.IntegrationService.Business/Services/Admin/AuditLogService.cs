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

using Arbisoft.DevLake.IntegrationService.Business.Dtos.Admin;
using Arbisoft.DevLake.IntegrationService.Business.Services.Audit;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Admin;

public interface IAuditLogService
{
    /// <summary>One page of the audit entries that match <paramref name="query"/>, newest first.</summary>
    Task<PageDto<AuditLogDto>> ListAsync(AuditLogQuery query, int page, CancellationToken cancellationToken);
}

/// <summary>Reads the audit trail for the portal. Nothing here changes it.</summary>
public sealed class AuditLogService : IAuditLogService
{
    public const int PageSize = 50;

    private readonly IAuditLogRepository _auditLogs;

    public AuditLogService(IAuditLogRepository auditLogs)
    {
        _auditLogs = auditLogs;
    }

    /// <summary>Who an entry can be by, in the order the portal offers them.</summary>
    public static IReadOnlyList<string> ActorKinds { get; } = [AuditActorKind.User, AuditActorKind.System, AuditActorKind.Client];

    public static IReadOnlyList<string> EntityTypes { get; } =
    [
        AuditEntityTypes.Client, AuditEntityTypes.ClientConfig, AuditEntityTypes.Scope, AuditEntityTypes.EmailMapping, AuditEntityTypes.SigningKey,
        AuditEntityTypes.AccessToken, AuditEntityTypes.UpstreamToken, AuditEntityTypes.PortalUser, AuditEntityTypes.Request
    ];

    public static IReadOnlyList<string> Actions { get; } =
    [
        AuditActions.Created, AuditActions.Updated, AuditActions.Revoked, AuditActions.Rotated, AuditActions.Retried, AuditActions.SecretCreated,
        AuditActions.SecretRevoked, AuditActions.CallbackUrlCreated, AuditActions.CallbackUrlUpdated, AuditActions.ScopesChanged,
        AuditActions.AccessChanged, AuditActions.StatusChanged, AuditActions.SignedIn, AuditActions.SignInRefused, AuditActions.SignedOut,
        AuditActions.PasswordChanged, AuditActions.TokenIssued, AuditActions.TokenRefused
    ];

    public async Task<PageDto<AuditLogDto>> ListAsync(AuditLogQuery query, int page, CancellationToken cancellationToken)
    {
        var (from, before) = UtcDays.Range(query.From, query.To);
        var filter = new AuditLogFilter(
            ActorKind: Known(ActorKinds, query.ActorKind),
            EntityType: Known(EntityTypes, query.EntityType),
            EntityId: string.IsNullOrWhiteSpace(query.EntityId) ? null : query.EntityId.Trim(),
            Action: Known(Actions, query.Action),
            From: from,
            To: before);
        var result = await _auditLogs.ListAsync(filter, Math.Max(page, 1), PageSize, cancellationToken);
        return new PageDto<AuditLogDto>(result.Items.Select(ToDto).ToList(), result.TotalCount, result.Page, result.PageSize);
    }

    private static string? Known(IReadOnlyList<string> known, string? value) => value is not null && known.Contains(value) ? value : null;

    private static AuditLogDto ToDto(AuditLog log) => new(
        log.Id,
        log.OccurredOn,
        log.ActorKind,
        log.ActorName,
        log.Action,
        log.EntityType,
        log.EntityId,
        log.EntityLabel,
        AuditTrail.ReadChanges(log.Changes),
        log.Reason,
        log.IpAddress);
}
