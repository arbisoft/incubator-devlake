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
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Options;

namespace Arbisoft.DevLake.IntegrationService.API.Portal;

/// <summary>
/// Signs administrators in to the portal pages next to the client API's bearer tokens, in the same process. A request for a Razor page is
/// authenticated with the portal's cookie and everything else with the bearer token, so neither kind of caller can use the other's credential.
/// </summary>
public static class PortalAuthenticationConfiguration
{
    private const string PageOrApiScheme = "PageOrApi";

    public static IServiceCollection AddPortalAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<SsoOptions>().Bind(configuration.GetSection(SsoOptions.SectionName)).ValidateOnStart();
        services.AddSingleton<IValidateOptions<SsoOptions>, SsoOptionsValidator>();
        var sso = configuration.GetSection(SsoOptions.SectionName).Get<SsoOptions>() ?? new SsoOptions();

        // Portal users live in the database (PortalUsers): the seeded local administrator signs in with a password, everyone else with single sign-on.
        var authentication = services.AddAuthentication(options =>
        {
            options.DefaultScheme = PageOrApiScheme;
            options.DefaultSignInScheme = CookieAuthenticationDefaults.AuthenticationScheme;
            options.DefaultSignOutScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        });

        authentication.AddPolicyScheme(PageOrApiScheme, displayName: null, options =>
            options.ForwardDefaultSelector = context =>
                context.GetEndpoint()?.Metadata.GetMetadata<PageActionDescriptor>() is not null
                    ? CookieAuthenticationDefaults.AuthenticationScheme
                    : JwtBearerDefaults.AuthenticationScheme);

        authentication.AddCookie(options =>
        {
            options.LoginPath = "/Account/Login";
            options.AccessDeniedPath = PortalAuthentication.NoAccessPath;
            options.Cookie.Name = "integration-admin";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
            options.ExpireTimeSpan = TimeSpan.FromHours(8);
            options.SlidingExpiration = true;
            options.Events.OnValidatePrincipal = PortalAuthentication.RefreshAsync;
        });

        if (sso.IsConfigured)
        {
            authentication.AddOpenIdConnect(PortalAuthentication.SsoScheme, sso.DisplayName, options =>
            {
                options.Authority = sso.Authority;
                options.ClientId = sso.ClientId;
                options.ClientSecret = sso.ClientSecret;
                options.ResponseType = "code";
                options.UsePkce = true;
                options.CallbackPath = "/signin-oidc";
                options.SignInScheme = CookieAuthenticationDefaults.AuthenticationScheme;
                options.MapInboundClaims = false;
                options.SaveTokens = false;
                options.Scope.Clear();
                options.Scope.Add("openid");
                options.Scope.Add("profile");
                options.Scope.Add("email");
                options.Events.OnTokenValidated = PortalAuthentication.OnSsoTokenValidatedAsync;
                options.Events.OnRemoteFailure = PortalAuthentication.OnSsoRemoteFailureAsync;
            });
        }

        // The API's fallback policy (any signed-in client) is left alone for controllers. Pages get theirs from RequireEditorByDefaultConvention.
        services.AddAuthorizationBuilder()
            .AddPolicy(PortalAuthentication.SignedInPolicy, policy => policy.RequireAuthenticatedUser())
            .AddPolicy(PortalAuthentication.EditorPolicy, policy => policy.RequireRole(PortalRole.Editor, PortalRole.Admin))
            .AddPolicy(PortalAuthentication.AdminPolicy, policy => policy.RequireRole(PortalRole.Admin));
        return services;
    }
}
