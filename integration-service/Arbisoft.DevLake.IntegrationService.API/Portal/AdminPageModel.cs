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
using Arbisoft.DevLake.IntegrationService.Business.Services.Audit;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Arbisoft.DevLake.IntegrationService.API.Portal;

public abstract class AdminPageModel : PageModel
{
    /// <summary>The signed-in portal user's name (username or email), recorded as createdBy or modifiedBy.</summary>
    protected string Admin => User.Identity?.Name ?? "unknown";

    /// <summary>The signed-in portal user's id.</summary>
    protected long CurrentUserId => long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0", CultureInfo.InvariantCulture);

    /// <summary>The signed-in portal user, as the audit trail records them.</summary>
    protected AuditActor Actor => AuditActor.User(CurrentUserId, Admin);

    [TempData]
    public string? Message { get; set; }

    public static string Utc(DateTimeOffset? value) =>
        value is null ? "—" : value.Value.UtcDateTime.ToString("yyyy-MM-dd HH:mm 'UTC'", CultureInfo.InvariantCulture);

    /// <summary>
    /// The badge colour for a request or attempt status: <c>ok</c> when it succeeded, <c>danger</c> when it failed or was refused, <c>info</c> while it
    /// waits or runs, <c>warn</c> for an administrator's retry, and plain otherwise.
    /// </summary>
    public static string Tone(string? status) => status switch
    {
        "Success" or "Delivered" => "ok",
        "Failed" or "DeliveryFailed" or "FetchFailed" or "PublishFailed" or "Expired" or "Revoked - no callback URL" => "danger",
        "Received" or "Queued" or "Processing" or "Processed" => "info",
        "Retried" => "warn",
        _ => string.Empty
    };

    protected IActionResult Fail(string? error)
    {
        ModelState.AddModelError(string.Empty, error ?? "The change failed.");
        return Page();
    }
}
