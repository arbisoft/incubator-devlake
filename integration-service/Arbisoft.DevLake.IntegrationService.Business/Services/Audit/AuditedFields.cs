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

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Audit;

/// <summary>
/// The fields the audit trail records for each kind of object, by the names the portal shows. A field that is not listed is never recorded, and
/// secrets are hidden: the trail says they were set or changed, never what they are.
/// </summary>
public static class AuditedFields
{
    // Fields recorded by hand, for changes that are not a plain edit of a listed field.
    public const string Secret = "Secret";
    public const string Expires = "Expires";
    public const string TokensRevoked = "Tokens revoked with it";
    public const string Scopes = "Scopes";
    public const string Status = "Status";
    public const string ActiveKey = "Active key";
    public const string Algorithm = "Algorithm";
    public const string Token = "Token";
    public const string Password = "Password";

    public static AuditFields<Client> Client { get; } = new AuditFields<Client>()
        .Add("Client ID", c => c.ClientId)
        .Add("Name", c => c.Name)
        .Add("Active", c => c.IsActive)
        .Add("Token lifetime (seconds)", c => c.AccessTokenLifetimeSeconds);

    public static AuditFields<ClientConfig> ClientConfig { get; } = new AuditFields<ClientConfig>()
        .Add("Auth type", c => c.AuthType)
        .Add("Base URL", c => c.BaseUrl)
        .Add("Token URL", c => c.TokenUrl)
        .Add("Client ID", c => c.OutboundClientId)
        .AddHidden("Client secret", c => c.OutboundClientSecretEncrypted)
        .Add("Scope", c => c.OutboundScope)
        .AddHidden("API token", c => c.ApiTokenEncrypted)
        .Add("Token expires", c => c.TokenExpiresOn)
        .Add("Max attempts", c => c.MaxAttempts)
        .Add("Active", c => c.IsActive);

    public static AuditFields<ClientConfigOutboundUrl> CallbackUrl { get; } = new AuditFields<ClientConfigOutboundUrl>()
        .Add("Event type", u => u.EventType)
        .Add("Method", u => u.Method)
        .Add("Path", u => u.Path)
        .Add("Active", u => u.IsActive);

    public static AuditFields<Scope> Scope { get; } = new AuditFields<Scope>()
        .Add("Name", s => s.Name)
        .Add("Description", s => s.Description);

    public static AuditFields<EmailMapping> EmailMapping { get; } = new AuditFields<EmailMapping>()
        .Add("Arbisoft email", m => m.ArbisoftEmail)
        .Add("Mapped email", m => m.Email)
        .Add("Mapped email as typed", m => m.EmailAsReceived);

    public static AuditFields<PortalUser> PortalUserAccess { get; } = new AuditFields<PortalUser>()
        .Add("Access", u => u.Role)
        .Add("Active", u => u.IsActive);
}
