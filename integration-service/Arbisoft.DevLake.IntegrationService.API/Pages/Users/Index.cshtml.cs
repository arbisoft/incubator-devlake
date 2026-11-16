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
using Arbisoft.DevLake.IntegrationService.Business.Dtos.Admin;
using Arbisoft.DevLake.IntegrationService.Business.Services.Admin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Arbisoft.DevLake.IntegrationService.API.Pages.Users;

/// <summary>Who may use the portal. Administrators only: grant Editor or Admin, take access away, or disable an account.</summary>
[Authorize(Policy = PortalAuthentication.AdminPolicy)]
public sealed class IndexModel(IPortalUserService users) : AdminPageModel
{
    public IReadOnlyList<PortalUserDto> Users { get; private set; } = [];

    public long SignedInUserId => CurrentUserId;

    public async Task OnGetAsync(CancellationToken cancellationToken) => Users = await users.ListAsync(cancellationToken);

    public async Task<IActionResult> OnPostAsync(long id, string? role, bool isActive, CancellationToken cancellationToken)
    {
        var result = await users.SetAccessAsync(id, role, isActive, CurrentUserId, Actor, cancellationToken);
        if (!result.Succeeded)
        {
            Users = await users.ListAsync(cancellationToken);
            return Fail(result.Error);
        }

        Message = "Access updated. It applies on the user's next page load.";
        return RedirectToPage();
    }
}
