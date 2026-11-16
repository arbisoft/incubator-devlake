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


using Arbisoft.DevLake.IntegrationService.API.Portal;
using Arbisoft.DevLake.IntegrationService.Business.Services.Admin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Arbisoft.DevLake.IntegrationService.API.Pages.Account;

/// <summary>Changes the local administrator's password. The seeded default must be changed here before anything else can be used.</summary>
[Authorize(Policy = PortalAuthentication.SignedInPolicy)]
public sealed class ChangePasswordModel(IPortalUserService users) : AdminPageModel
{
    [BindProperty]
    public string CurrentPassword { get; set; } = string.Empty;

    [BindProperty]
    public string NewPassword { get; set; } = string.Empty;

    [BindProperty]
    public string ConfirmPassword { get; set; } = string.Empty;

    public bool IsRequired => User.HasClaim(PortalAuthentication.MustChangePasswordClaim, "true");

    public void OnGet()
    {
    }

    public async Task<IActionResult> OnPostAsync(CancellationToken cancellationToken)
    {
        var result = await users.ChangePasswordAsync(CurrentUserId, CurrentPassword, NewPassword, ConfirmPassword, cancellationToken);
        CurrentPassword = NewPassword = ConfirmPassword = string.Empty;
        if (!result.Succeeded)
        {
            return Fail(result.Error);
        }

        Message = "Your password is changed.";
        return LocalRedirect("/");
    }
}
