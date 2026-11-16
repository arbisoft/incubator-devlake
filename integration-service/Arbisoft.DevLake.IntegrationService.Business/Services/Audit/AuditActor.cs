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

using System.Globalization;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Audit;

/// <summary>Who an audit entry is recorded against: a portal user, the service itself, or an API client.</summary>
public sealed record AuditActor(string Kind, string? Id, string Name)
{
    /// <summary>The name recorded for the service's own actions, such as the processing job moving a request on.</summary>
    public const string SystemName = "system";

    /// <summary>The name recorded for a refused sign-in whose username matches no portal user. What was typed is never stored.</summary>
    public const string UnknownUserName = "unknown";

    public static AuditActor System { get; } = new(AuditActorKind.System, null, SystemName);

    public static AuditActor UnknownUser { get; } = new(AuditActorKind.User, null, UnknownUserName);

    /// <summary>A refused token request whose client ID matches no client. What was sent as the client ID is never stored.</summary>
    public static AuditActor UnknownClient { get; } = new(AuditActorKind.Client, null, UnknownUserName);

    public static AuditActor User(long userId, string name) => new(AuditActorKind.User, userId.ToString(CultureInfo.InvariantCulture), name);

    public static AuditActor Client(string clientId) => new(AuditActorKind.Client, clientId, clientId);
}
