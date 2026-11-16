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

namespace Arbisoft.DevLake.IntegrationService.API.Portal;

/// <summary>
/// One step of the trail the layout shows above a page's heading: Overview, then the page's parents, then the page itself. A page lists its parents in
/// <see cref="ParentsKey"/>; the last step is the page's title, or <see cref="CurrentKey"/> when the title is too generic to read in a trail.
/// </summary>
public sealed record Breadcrumb(string Label, string? Url)
{
    public const string ParentsKey = "Breadcrumbs";

    public const string CurrentKey = "Breadcrumb";
}
