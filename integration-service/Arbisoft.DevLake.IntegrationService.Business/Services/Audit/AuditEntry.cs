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
/// What happened, to which object. <paramref name="Action"/> is one of <see cref="AuditActions"/> and <paramref name="EntityType"/> one of
/// <see cref="AuditEntityTypes"/>. <paramref name="EntityLabel"/> is the object's readable name at the time, such as a client's name.
/// <paramref name="Reason"/> is why it was done, when someone gave a reason, or which part of the object it concerns, such as one callback URL.
/// </summary>
public sealed record AuditEntry(
    string Action,
    string EntityType,
    string EntityId,
    string? EntityLabel = null,
    IReadOnlyList<AuditChange>? Changes = null,
    string? Reason = null,
    string? IpAddress = null);
