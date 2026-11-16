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
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis;
using Microsoft.AspNetCore.Mvc;

namespace Arbisoft.DevLake.IntegrationService.API.Pages.UpstreamTokens;

/// <summary>The DevLake and Workstream API tokens: write-only, stored encrypted, checked against each system on request.</summary>
public sealed class IndexModel(IUpstreamTokenService tokens) : AdminPageModel
{
    public IReadOnlyList<UpstreamTokenDto> Tokens { get; private set; } = [];

    public async Task OnGetAsync(CancellationToken cancellationToken) => Tokens = await tokens.ListAsync(cancellationToken);

    public async Task<IActionResult> OnPostSaveAsync(UpstreamSystem system, string? token, CancellationToken cancellationToken)
    {
        var result = await tokens.SaveAsync(system, token, Actor, cancellationToken);
        if (!result.Succeeded)
        {
            Tokens = await tokens.ListAsync(cancellationToken);
            return Fail(result.Error);
        }

        Message = $"The {UpstreamSystems.NameOf(system)} token is saved. The API starts using it within a minute.";
        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostCheckAsync(UpstreamSystem system, CancellationToken cancellationToken)
    {
        var result = await tokens.CheckAsync(system, cancellationToken);
        if (!result.Succeeded)
        {
            Tokens = await tokens.ListAsync(cancellationToken);
            return Fail(result.Error);
        }

        Message = result.Value;
        return RedirectToPage();
    }
}
