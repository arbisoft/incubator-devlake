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

using System.Threading.RateLimiting;
using Arbisoft.DevLake.IntegrationService.Business;
using Arbisoft.DevLake.IntegrationService.DataAccess;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.Web;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((context, services, configuration) => configuration
    .ReadFrom.Configuration(context.Configuration)
    .ReadFrom.Services(services)
    .Enrich.FromLogContext());

builder.Host.UseDefaultServiceProvider(options =>
{
    options.ValidateScopes = true;
    options.ValidateOnBuild = true;
});

builder.Services.AddDataAccess(builder.Configuration);
builder.Services.AddBusiness(builder.Configuration);
builder.Services.AddOptions<SsoOptions>().Bind(builder.Configuration.GetSection(SsoOptions.SectionName)).ValidateOnStart();
builder.Services.AddSingleton<IValidateOptions<SsoOptions>, SsoOptionsValidator>();
var sso = builder.Configuration.GetSection(SsoOptions.SectionName).Get<SsoOptions>() ?? new SsoOptions();

// Portal users live in the database (PortalUsers): the seeded local administrator signs in with a password, everyone else with single sign-on.
var authentication = builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
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

// Every page needs an editor or administrator unless it says otherwise, so a new page is never open by accident. Someone signed in without
// access only reaches the "ask the administrator" page, changing their password and signing out.
builder.Services.AddAuthorizationBuilder()
    .AddPolicy(PortalAuthentication.SignedInPolicy, policy => policy.RequireAuthenticatedUser())
    .AddPolicy(PortalAuthentication.EditorPolicy, policy => policy.RequireRole(PortalRole.Editor, PortalRole.Admin))
    .AddPolicy(PortalAuthentication.AdminPolicy, policy => policy.RequireRole(PortalRole.Admin))
    .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().RequireRole(PortalRole.Editor, PortalRole.Admin).Build());

builder.Services.AddRazorPages();
builder.Services.AddHealthChecks();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? string.Empty,
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();

// While a password must be changed (the seeded admin/admin), nothing else in the portal can be used.
app.Use(async (context, next) =>
{
    var path = context.Request.Path;
    if (context.User.HasClaim(PortalAuthentication.MustChangePasswordClaim, "true")
        && !path.StartsWithSegments(PortalAuthentication.ChangePasswordPath, StringComparison.OrdinalIgnoreCase)
        && !path.StartsWithSegments("/Account/Logout", StringComparison.OrdinalIgnoreCase)
        && !path.StartsWithSegments("/health", StringComparison.OrdinalIgnoreCase))
    {
        context.Response.Redirect(PortalAuthentication.ChangePasswordPath);
        return;
    }

    await next();
});

app.UseAuthorization();
app.UseRateLimiter();

app.MapRazorPages();
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") }).AllowAnonymous();

app.Run();
return 0;

/// <summary>Entry point marker so tests can host the admin portal with WebApplicationFactory.</summary>
public partial class Program;
