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
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Arbisoft.DevLake.IntegrationService.API.Pages.RequestLogs;

public sealed class IndexModel(IRequestLogService logs, IClientService clients) : AdminPageModel
{
    [BindProperty(SupportsGet = true)]
    public long? ClientRefId { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? Status { get; set; }

    [BindProperty(SupportsGet = true)]
    public DateOnly? From { get; set; }

    [BindProperty(SupportsGet = true)]
    public DateOnly? To { get; set; }

    public IReadOnlyList<ClientDto> Clients { get; private set; } = [];

    public IReadOnlyList<string> Statuses => logs.Statuses;

    public IReadOnlyList<int> PageSizes => RequestLogService.PageSizes;

    public int DefaultPageSize => RequestLogService.DefaultPageSize;

    public async Task OnGetAsync(CancellationToken cancellationToken)
    {
        Clients = await clients.ListAsync(cancellationToken);
    }

    /// <summary>
    /// The list's data, asked for by the table in the page each time a filter, the sorting, the page or the page size changes. It answers only the
    /// rows of that page, in the shape DataTables' server-side mode expects. <paramref name="sort"/> is one of the names in the table below;
    /// anything else sorts by the created time.
    /// </summary>
    public async Task<IActionResult> OnGetListAsync(int draw, int page = 1, int pageSize = RequestLogService.DefaultPageSize, string? sort = null, string? dir = null, CancellationToken cancellationToken = default)
    {
        var column = sort switch
        {
            "modified" => RequestLogSortColumn.ModifiedOn,
            "event" => RequestLogSortColumn.EventType,
            "status" => RequestLogSortColumn.Status,
            "correlation" => RequestLogSortColumn.CorrelationId,
            _ => RequestLogSortColumn.CreatedOn
        };
        var result = await logs.ListAsync(
            new RequestLogQuery(ClientRefId, Status, From, To), page, pageSize, new RequestLogSort(column, !string.Equals(dir, "asc", StringComparison.OrdinalIgnoreCase)), cancellationToken);
        return new JsonResult(new
        {
            draw,
            recordsTotal = result.TotalCount,
            recordsFiltered = result.TotalCount,
            data = result.Items.Select(log => new
            {
                id = log.Id,
                created = Utc(log.CreatedOn),
                modified = Utc(log.ModifiedOn),
                client = log.ClientName,
                clientId = log.ClientId,
                eventType = log.EventType,
                status = log.Status,
                tone = Tone(log.Status),
                correlationId = log.CorrelationId
            })
        });
    }
}
