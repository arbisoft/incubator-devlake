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


using Microsoft.Extensions.Options;

namespace Arbisoft.DevLake.IntegrationService.Web;

/// <summary>
/// Single sign-on with Arbisoft accounts, through any OpenID Connect provider: Google Workspace (Authority https://accounts.google.com) or
/// Microsoft Entra ID (https://login.microsoftonline.com/{tenant}/v2.0). Off until enabled and configured; the seeded local administrator can
/// always sign in with a password.
/// </summary>
public sealed class SsoOptions
{
    public const string SectionName = "Sso";

    public bool Enabled { get; init; }

    /// <summary>The provider's name on the sign-in button.</summary>
    public string DisplayName { get; init; } = "Arbisoft";

    /// <summary>The provider's issuer URL, where its discovery document lives.</summary>
    public string Authority { get; init; } = string.Empty;

    public string ClientId { get; init; } = string.Empty;

    public string ClientSecret { get; init; } = string.Empty;

    /// <summary>Only emails in these domains may sign in; others are turned away before an account is created.</summary>
    public IReadOnlyList<string> AllowedDomains { get; init; } = ["arbisoft.com"];

    public bool IsConfigured => Enabled && !string.IsNullOrWhiteSpace(Authority) && !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret);
}

/// <summary>Fails startup when single sign-on is switched on but incomplete, instead of failing at the first sign-in.</summary>
public sealed class SsoOptionsValidator : IValidateOptions<SsoOptions>
{
    public ValidateOptionsResult Validate(string? name, SsoOptions options)
    {
        if (!options.Enabled)
        {
            return ValidateOptionsResult.Success;
        }

        if (!options.IsConfigured)
        {
            return ValidateOptionsResult.Fail("Sso:Enabled is true, so Sso:Authority, Sso:ClientId and Sso:ClientSecret are required.");
        }

        if (!Uri.TryCreate(options.Authority, UriKind.Absolute, out var authority) || authority.Scheme != Uri.UriSchemeHttps)
        {
            return ValidateOptionsResult.Fail("Sso:Authority must be an absolute HTTPS URL.");
        }

        return options.AllowedDomains.Count > 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail("Sso:AllowedDomains needs at least one domain.");
    }
}
