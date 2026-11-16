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
using System.Security.Claims;
using Arbisoft.DevLake.IntegrationService.Business.Dtos.Admin;
using Arbisoft.DevLake.IntegrationService.Business.Services.Admin;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Extensions.Options;

namespace Arbisoft.DevLake.IntegrationService.Web;

/// <summary>
/// How a portal user is signed in. The cookie carries the user's id, name, role and whether they must change their password; the role is read
/// from the database again on every request, so access an administrator grants or removes applies at once, and a disabled account is signed out.
/// </summary>
public static class PortalAuthentication
{
    public const string SsoScheme = "Sso";
    public const string EditorPolicy = "Editor";
    public const string AdminPolicy = "Admin";
    public const string SignedInPolicy = "SignedIn";
    public const string MustChangePasswordClaim = "must_change_password";
    public const string ChangePasswordPath = "/Account/ChangePassword";
    public const string NoAccessPath = "/Account/NoAccess";

    public static ClaimsPrincipal CreatePrincipal(PortalSignIn signIn)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, signIn.UserId.ToString(CultureInfo.InvariantCulture)),
            new(ClaimTypes.Name, signIn.Name),
            new(ClaimTypes.Role, signIn.Role)
        };
        if (signIn.MustChangePassword)
        {
            claims.Add(new Claim(MustChangePasswordClaim, "true"));
        }

        return new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme));
    }

    /// <summary>Whether the signed-in user may see and change data: an editor or an administrator.</summary>
    public static bool HasAccess(ClaimsPrincipal user) => user.IsInRole(PortalRole.Editor) || user.IsInRole(PortalRole.Admin);

    /// <summary>Re-reads the signed-in user on every request, so a role change or a disabled account applies at once.</summary>
    public static async Task RefreshAsync(CookieValidatePrincipalContext context)
    {
        var id = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        var current = long.TryParse(id, NumberStyles.None, CultureInfo.InvariantCulture, out var userId)
            ? await context.HttpContext.RequestServices.GetRequiredService<IPortalUserService>().GetCurrentAsync(userId, context.HttpContext.RequestAborted)
            : null;
        if (current is null)
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return;
        }

        var stored = context.Principal!;
        var changed = stored.FindFirstValue(ClaimTypes.Role) != current.Role
            || stored.FindFirstValue(ClaimTypes.Name) != current.Name
            || stored.HasClaim(MustChangePasswordClaim, "true") != current.MustChangePassword;
        if (changed)
        {
            context.ReplacePrincipal(CreatePrincipal(current));
            context.ShouldRenew = true;
        }
    }

    /// <summary>
    /// After the identity provider vouched for the person: finds or creates their portal account by email (a new one has no access) and signs them
    /// in as that account. Someone outside the allowed domains, or a disabled account, goes back to the sign-in page with a reason.
    /// </summary>
    public static async Task OnSsoTokenValidatedAsync(TokenValidatedContext context)
    {
        var principal = context.Principal!;
        var email = principal.FindFirstValue("email") ?? principal.FindFirstValue("preferred_username") ?? principal.FindFirstValue("upn");
        var verified = principal.FindFirstValue("email_verified");
        var name = principal.FindFirstValue("name");
        var options = context.HttpContext.RequestServices.GetRequiredService<IOptions<SsoOptions>>().Value;
        var logger = context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(PortalAuthentication));

        if (string.Equals(verified, "false", StringComparison.OrdinalIgnoreCase))
        {
            Refuse(context, "not-allowed");
            return;
        }

        var result = await context.HttpContext.RequestServices.GetRequiredService<IPortalUserService>()
            .SignInWithSsoAsync(email, name, options.AllowedDomains, context.HttpContext.RequestAborted);
        switch (result.Outcome)
        {
            case SsoSignInOutcome.SignedIn:
                context.Principal = CreatePrincipal(result.SignIn!);
                logger.LogInformation("Portal user {UserId} signed in with single sign-on.", result.SignIn!.UserId);
                break;
            case SsoSignInOutcome.Disabled:
                Refuse(context, "disabled");
                break;
            default:
                logger.LogWarning("Refused a single sign-on from outside the allowed domains.");
                Refuse(context, "not-allowed");
                break;
        }
    }

    public static Task OnSsoRemoteFailureAsync(RemoteFailureContext context)
    {
        context.Response.Redirect("/Account/Login?error=sso");
        context.HandleResponse();
        return Task.CompletedTask;
    }

    private static void Refuse(TokenValidatedContext context, string reason)
    {
        context.Response.Redirect("/Account/Login?error=" + reason);
        context.HandleResponse();
    }
}
