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

using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.AspNetCore.Mvc.ViewFeatures;
using Microsoft.AspNetCore.Razor.TagHelpers;

namespace Arbisoft.DevLake.IntegrationService.API.Portal;

/// <summary>
/// <c>&lt;history-link type="Client" entity-id="7" label="Sophia" /&gt;</c>: an icon button that opens one object's history in the audit trail.
/// </summary>
[HtmlTargetElement("history-link", TagStructure = TagStructure.WithoutEndTag)]
public sealed class HistoryLinkTagHelper(LinkGenerator links) : TagHelper
{
    private const string ClockIcon =
        "<svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" " +
        "stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 12a9 9 0 1 0 3-6.7L3 8\"/><path d=\"M3 3v5h5\"/><path d=\"M12 7v5l3 2\"/></svg>";

    /// <summary>One of the audit trail's object types.</summary>
    public string Type { get; set; } = string.Empty;

    public string EntityId { get; set; } = string.Empty;

    /// <summary>The object's name, read out by screen readers.</summary>
    public string? Label { get; set; }

    [ViewContext]
    [HtmlAttributeNotBound]
    public ViewContext ViewContext { get; set; } = null!;

    public override void Process(TagHelperContext context, TagHelperOutput output)
    {
        output.TagName = "a";
        output.TagMode = TagMode.StartTagAndEndTag;
        output.Attributes.SetAttribute("href", links.GetPathByPage(ViewContext.HttpContext, "/AuditLogs/History", values: new { type = Type, id = EntityId }));
        output.Attributes.SetAttribute("class", "icon-button");
        output.Attributes.SetAttribute("title", "History");
        output.Attributes.SetAttribute("aria-label", "History of " + (Label ?? EntityId));
        output.Content.SetHtmlContent(ClockIcon);
    }
}
