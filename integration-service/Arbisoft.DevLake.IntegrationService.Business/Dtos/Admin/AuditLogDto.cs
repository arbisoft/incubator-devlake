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

using Arbisoft.DevLake.IntegrationService.Business.Services.Audit;

namespace Arbisoft.DevLake.IntegrationService.Business.Dtos.Admin;

/// <summary>
/// Which audit entries to list. Null means no filter. <see cref="ActorKind"/> is one of the actor kinds, <see cref="EntityType"/> one of
/// <see cref="AuditEntityTypes"/> and <see cref="Action"/> one of <see cref="AuditActions"/>; any other value is ignored. The dates are UTC days,
/// both included.
/// </summary>
public sealed record AuditLogQuery(
    string? ActorKind = null, string? EntityType = null, string? EntityId = null, string? Action = null, DateOnly? From = null, DateOnly? To = null);

/// <summary>One audit entry as the portal shows it, with its field changes read back. Hidden fields carry no values.</summary>
public sealed record AuditLogDto(
    long Id,
    DateTimeOffset OccurredOn,
    string ActorKind,
    string ActorName,
    string Action,
    string EntityType,
    string EntityId,
    string? EntityLabel,
    IReadOnlyList<AuditChange> Changes,
    string? Reason,
    string? IpAddress);
