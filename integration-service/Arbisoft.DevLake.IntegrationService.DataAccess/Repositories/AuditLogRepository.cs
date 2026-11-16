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

using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Options;
using Arbisoft.DevLake.IntegrationService.DataAccess.Persistence;
using Microsoft.Extensions.Options;

namespace Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;

public sealed class AuditLogRepository : RepositoryBase, IAuditLogRepository
{
    private const string Columns =
        "id, occurredOn, actorKind, actorId, actorName, action, entityType, entityId, entityLabel, changes, reason, ipAddress, traceId";

    public AuditLogRepository(IDbSession session, IOptions<DatabaseOptions> options)
        : base(session, options)
    {
    }

    public Task<long> InsertAsync(AuditLog entry, CancellationToken cancellationToken)
    {
        return InsertAsync(
            "INSERT INTO AuditLogs (occurredOn, actorKind, actorId, actorName, action, entityType, entityId, entityLabel, changes, reason, ipAddress, traceId) " +
            "VALUES (@OccurredOn, @ActorKind, @ActorId, @ActorName, @Action, @EntityType, @EntityId, @EntityLabel, @Changes, @Reason, @IpAddress, @TraceId)",
            entry,
            cancellationToken);
    }

    public Task<PagedResult<AuditLog>> ListAsync(AuditLogFilter filter, int page, int pageSize, CancellationToken cancellationToken)
    {
        const string fromAndWhere =
            "FROM AuditLogs WHERE (@ActorKind IS NULL OR actorKind = @ActorKind) AND (@ActorId IS NULL OR actorId = @ActorId) " +
            "AND (@EntityType IS NULL OR entityType = @EntityType) AND (@EntityId IS NULL OR entityId = @EntityId) " +
            "AND (@Action IS NULL OR action = @Action) AND (@From IS NULL OR occurredOn >= @From) AND (@To IS NULL OR occurredOn < @To)";
        return QueryPageAsync<AuditLog>(Columns, fromAndWhere, "occurredOn DESC, id DESC", filter, page, pageSize, cancellationToken);
    }
}
