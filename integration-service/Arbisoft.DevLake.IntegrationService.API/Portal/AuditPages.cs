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

namespace Arbisoft.DevLake.IntegrationService.API.Portal;

/// <summary>A page of audit entries for the portal's table, and whether to show which object each one is about.</summary>
public sealed record AuditEntriesView(IReadOnlyList<AuditLogDto> Entries, bool ShowObject);

/// <summary>How the portal names each kind of object in the audit trail, and the list page it belongs to.</summary>
public sealed record AuditObjectKind(string Name, string ListTitle, string ListPage);

/// <summary>Display names for the audit trail's object types, actions and actors.</summary>
public static class AuditPages
{
    private static readonly Dictionary<string, AuditObjectKind> Kinds = new(StringComparer.Ordinal)
    {
        [AuditEntityTypes.Client] = new("Client", "Clients", "/Clients/Index"),
        [AuditEntityTypes.ClientConfig] = new("Outbound config", "Outbound configs", "/ClientConfigs/Index"),
        [AuditEntityTypes.Scope] = new("Scope", "Scopes", "/Scopes/Index"),
        [AuditEntityTypes.EmailMapping] = new("Email mapping", "Email mappings", "/EmailMappings/Index"),
        [AuditEntityTypes.SigningKey] = new("Signing key", "Signing keys", "/SigningKeys/Index"),
        [AuditEntityTypes.AccessToken] = new("Access token", "Access tokens", "/AccessTokens/Index"),
        [AuditEntityTypes.UpstreamToken] = new("Upstream token", "Upstream tokens", "/UpstreamTokens/Index"),
        [AuditEntityTypes.PortalUser] = new("User", "Users", "/Users/Index"),
        [AuditEntityTypes.Request] = new("Request", "Request logs", "/RequestLogs/Index")
    };

    private static readonly Dictionary<string, string> ActionNames = new(StringComparer.Ordinal)
    {
        [AuditActions.Created] = "Created",
        [AuditActions.Updated] = "Updated",
        [AuditActions.Revoked] = "Revoked",
        [AuditActions.Rotated] = "Rotated",
        [AuditActions.Retried] = "Retried",
        [AuditActions.SecretCreated] = "Secret created",
        [AuditActions.SecretRevoked] = "Secret revoked",
        [AuditActions.CallbackUrlCreated] = "Callback URL added",
        [AuditActions.CallbackUrlUpdated] = "Callback URL changed",
        [AuditActions.ScopesChanged] = "Scopes changed",
        [AuditActions.AccessChanged] = "Access changed",
        [AuditActions.StatusChanged] = "Status changed",
        [AuditActions.SignedIn] = "Signed in",
        [AuditActions.SignInRefused] = "Sign-in refused",
        [AuditActions.SignedOut] = "Signed out",
        [AuditActions.PasswordChanged] = "Password changed",
        [AuditActions.TokenIssued] = "Token issued",
        [AuditActions.TokenRefused] = "Token refused"
    };

    private static readonly Dictionary<string, string> ActorKindNames = new(StringComparer.Ordinal)
    {
        [AuditActorKind.User] = "People",
        [AuditActorKind.System] = "The service",
        [AuditActorKind.Client] = "API clients"
    };

    /// <summary>The kind of object, or null for a type the portal does not know.</summary>
    public static AuditObjectKind? KindOf(string? entityType) => entityType is not null && Kinds.TryGetValue(entityType, out var kind) ? kind : null;

    public static string ActionName(string action) => ActionNames.GetValueOrDefault(action, action);

    public static string ActorKindName(string actorKind) => ActorKindNames.GetValueOrDefault(actorKind, actorKind);

    /// <summary>The badge colour for an action: refusals and revocations stand out, sign-ins and the service's own work stay quiet.</summary>
    public static string Tone(string action) => action switch
    {
        AuditActions.SignInRefused or AuditActions.TokenRefused or AuditActions.Revoked or AuditActions.SecretRevoked => "danger",
        AuditActions.Created or AuditActions.SecretCreated or AuditActions.CallbackUrlCreated => "ok",
        AuditActions.Retried or AuditActions.Rotated or AuditActions.AccessChanged or AuditActions.PasswordChanged => "warn",
        _ => string.Empty
    };
}
