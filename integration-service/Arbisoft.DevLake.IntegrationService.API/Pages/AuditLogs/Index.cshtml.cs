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
using Arbisoft.DevLake.IntegrationService.API.Portal;
using Arbisoft.DevLake.IntegrationService.Business.Dtos.Admin;
using Arbisoft.DevLake.IntegrationService.Business.Services.Admin;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Microsoft.AspNetCore.Mvc;

namespace Arbisoft.DevLake.IntegrationService.API.Pages.AuditLogs;

/// <summary>The whole audit trail, newest first. It shows people's actions until another "who" is chosen, because the service's own entries are many.</summary>
public sealed class IndexModel(IAuditLogService audit) : AdminPageModel
{
    /// <summary>The "who" choice that shows everyone.</summary>
    public const string Everyone = "All";

    [BindProperty(SupportsGet = true)]
    public string? Who { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? EntityType { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? Action { get; set; }

    [BindProperty(SupportsGet = true)]
    public DateOnly? From { get; set; }

    [BindProperty(SupportsGet = true)]
    public DateOnly? To { get; set; }

    [BindProperty(SupportsGet = true)]
    public int PageNumber { get; set; } = 1;

    public PageDto<AuditLogDto> Result { get; private set; } = new([], 0, 1, AuditLogService.PageSize);

    public string SelectedWho => Who ?? AuditActorKind.User;

    public async Task OnGetAsync(CancellationToken cancellationToken)
    {
        var actorKind = SelectedWho == Everyone ? null : SelectedWho;
        Result = await audit.ListAsync(new AuditLogQuery(actorKind, EntityType, null, Action, From, To), PageNumber, cancellationToken);
    }

    /// <summary>The query string of another page of the same list.</summary>
    public Dictionary<string, string> RouteFor(int pageNumber)
    {
        var route = new Dictionary<string, string> { ["Who"] = SelectedWho, ["PageNumber"] = pageNumber.ToString(CultureInfo.InvariantCulture) };
        AddIfSet(route, "EntityType", EntityType);
        AddIfSet(route, "Action", Action);
        AddIfSet(route, "From", From?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        AddIfSet(route, "To", To?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        return route;
    }

    private static void AddIfSet(Dictionary<string, string> route, string key, string? value)
    {
        if (!string.IsNullOrEmpty(value))
        {
            route[key] = value;
        }
    }
}
