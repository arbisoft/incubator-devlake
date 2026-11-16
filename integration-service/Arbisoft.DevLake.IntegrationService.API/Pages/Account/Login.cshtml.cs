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


using Arbisoft.DevLake.IntegrationService.API.Middleware;
using Arbisoft.DevLake.IntegrationService.API.Portal;
using Arbisoft.DevLake.IntegrationService.API.RateLimiting;
using Arbisoft.DevLake.IntegrationService.Business.Services.Admin;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace Arbisoft.DevLake.IntegrationService.API.Pages.Account;

/// <summary>Signs in with single sign-on (Arbisoft accounts), or with a password for the local administrator.</summary>
[AllowAnonymous]
[EnableRateLimiting(RateLimitPolicies.PortalLogin)]
public sealed class LoginModel(IPortalUserService users, IOptions<SsoOptions> sso, ILogger<LoginModel> logger) : PageModel
{
    [BindProperty]
    public string Username { get; set; } = string.Empty;

    [BindProperty]
    public string Password { get; set; } = string.Empty;

    [BindProperty(SupportsGet = true)]
    public string? ReturnUrl { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? Error { get; set; }

    public bool SsoEnabled => sso.Value.IsConfigured;

    public string SsoName => sso.Value.DisplayName;

    /// <summary>Why the last single sign-on did not go through, for the person to read.</summary>
    public string? ErrorMessage => Error switch
    {
        "not-allowed" => "Only Arbisoft accounts can sign in to this portal.",
        "disabled" => "Your account is disabled. Ask the administrator.",
        "sso" => "Signing in with " + sso.Value.DisplayName + " did not complete. Try again.",
        _ => null
    };

    public IActionResult OnGet()
    {
        return User.Identity?.IsAuthenticated == true ? LocalRedirect(SafeReturnUrl) : Page();
    }

    public async Task<IActionResult> OnPostAsync(CancellationToken cancellationToken)
    {
        var signIn = await users.SignInLocalAsync(Username, Password, HttpContext.CallerIp(), cancellationToken);
        if (signIn is null)
        {
            logger.LogWarning("Failed portal sign-in from {RemoteIp}.", HttpContext.Connection.RemoteIpAddress);
            ModelState.AddModelError(string.Empty, "The username or password is wrong.");
            Password = string.Empty;
            return Page();
        }

        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, PortalAuthentication.CreatePrincipal(signIn));
        logger.LogInformation("Portal user {UserId} signed in with a password.", signIn.UserId);
        return LocalRedirect(signIn.MustChangePassword ? PortalAuthentication.ChangePasswordPath : SafeReturnUrl);
    }

    public IActionResult OnPostSso()
    {
        return SsoEnabled
            ? Challenge(new AuthenticationProperties { RedirectUri = SafeReturnUrl }, PortalAuthentication.SsoScheme)
            : RedirectToPage();
    }

    private string SafeReturnUrl => Url.IsLocalUrl(ReturnUrl) ? ReturnUrl! : "/";
}
