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

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Audit;

/// <summary>
/// The object an audit entry is about: its kind (one of <see cref="AuditEntityTypes"/>), its id, and its readable name at the time.
/// </summary>
public sealed record AuditSubject(string EntityType, string EntityId, string? Label)
{
    /// <summary>An entry saying <paramref name="action"/> was done to this object.</summary>
    public AuditEntry Did(string action, IReadOnlyList<AuditChange>? changes = null, string? reason = null) =>
        new(action, EntityType, EntityId, Label, changes, reason);
}
