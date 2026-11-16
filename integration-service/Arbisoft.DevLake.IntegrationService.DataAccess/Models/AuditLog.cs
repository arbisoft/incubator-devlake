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

namespace Arbisoft.DevLake.IntegrationService.DataAccess.Models;

/// <summary>One entry of the audit trail. Rows are only inserted, never changed.</summary>
public sealed class AuditLog
{
    public long Id { get; init; }
    public DateTimeOffset OccurredOn { get; init; }

    /// <summary>One of <see cref="AuditActorKind"/>.</summary>
    public string ActorKind { get; init; } = AuditActorKind.System;

    /// <summary>The portal user's id or the API client's client ID; null for the service itself.</summary>
    public string? ActorId { get; init; }

    public string ActorName { get; init; } = string.Empty;
    public string Action { get; init; } = string.Empty;
    public string EntityType { get; init; } = string.Empty;
    public string EntityId { get; init; } = string.Empty;

    /// <summary>The object's name when the entry was written, so the trail still reads well after a rename.</summary>
    public string? EntityLabel { get; init; }

    /// <summary>The field-level differences as a JSON array, or null when the entry has none.</summary>
    public string? Changes { get; init; }

    public string? Reason { get; init; }
    public string? IpAddress { get; init; }
    public string? TraceId { get; init; }
}

/// <summary>Who wrote an audit entry.</summary>
public static class AuditActorKind
{
    /// <summary>A signed-in portal user, or someone trying to sign in.</summary>
    public const string User = "User";

    /// <summary>The service itself, such as the processing job.</summary>
    public const string System = "System";

    /// <summary>An API client, identified by its client ID.</summary>
    public const string Client = "Client";
}
