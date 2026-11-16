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
using Microsoft.AspNetCore.Mvc;

namespace Arbisoft.DevLake.IntegrationService.API.Pages.AuditLogs;

/// <summary>Everything the audit trail holds about one object, by everyone, newest first.</summary>
public sealed class HistoryModel(IAuditLogService audit) : AdminPageModel
{
    [BindProperty(Name = "type", SupportsGet = true)]
    public string? Type { get; set; }

    [BindProperty(Name = "id", SupportsGet = true)]
    public string? EntityId { get; set; }

    [BindProperty(SupportsGet = true)]
    public int PageNumber { get; set; } = 1;

    public AuditObjectKind Kind { get; private set; } = null!;

    public PageDto<AuditLogDto> Result { get; private set; } = new([], 0, 1, AuditLogService.PageSize);

    /// <summary>The object's most recent name, or its kind and id when the trail has no name for it yet, such as a request from before the trail began.</summary>
    public string Label => Result.Items.FirstOrDefault(entry => entry.EntityLabel is not null)?.EntityLabel ?? $"{Kind.Name} {EntityId}";

    /// <summary>Whether the trail holds the object's name. When it does not, the history dialog names it as the row it was opened from does.</summary>
    public bool HasName => Result.Items.Any(entry => entry.EntityLabel is not null);

    public async Task<IActionResult> OnGetAsync(CancellationToken cancellationToken)
    {
        return await LoadAsync(cancellationToken) ? Page() : NotFound();
    }

    /// <summary>The same history without the page around it, for the history dialog a list row opens.</summary>
    public async Task<IActionResult> OnGetModalAsync(CancellationToken cancellationToken)
    {
        return await LoadAsync(cancellationToken) ? Partial("_HistoryModal", this) : NotFound();
    }

    private async Task<bool> LoadAsync(CancellationToken cancellationToken)
    {
        if (AuditPages.KindOf(Type) is not { } kind || string.IsNullOrWhiteSpace(EntityId))
        {
            return false;
        }

        Kind = kind;
        Result = await audit.ListAsync(new AuditLogQuery(EntityType: Type, EntityId: EntityId), PageNumber, cancellationToken);
        return true;
    }
}
