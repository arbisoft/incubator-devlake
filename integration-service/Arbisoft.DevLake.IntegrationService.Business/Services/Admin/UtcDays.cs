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

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Admin;

/// <summary>A range of whole UTC days, as the portal's date filters mean it.</summary>
public static class UtcDays
{
    /// <summary>The instant <paramref name="from"/> starts, and the instant after <paramref name="to"/> ends, so both days are included.</summary>
    public static (DateTimeOffset? From, DateTimeOffset? Before) Range(DateOnly? from, DateOnly? to) => (
        from is { } first ? new DateTimeOffset(first.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero) : null,
        to is { } last ? new DateTimeOffset(last.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero) : null);
}
