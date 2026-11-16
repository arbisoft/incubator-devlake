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

using System.Collections;
using System.Globalization;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Audit;

/// <summary>How the audit trail writes a field's value.</summary>
public static class AuditValue
{
    /// <summary>A numeric id as an entry's entity id or value.</summary>
    public static string Id(long id) => id.ToString(CultureInfo.InvariantCulture);

    /// <summary>A value as the trail shows it. Empty text reads as no value, and a list is sorted so that reordering it is not a change.</summary>
    public static string? Read(object? value) => value switch
    {
        null => null,
        string text => text.Length == 0 ? null : text,
        bool flag => flag ? "Yes" : "No",
        DateTimeOffset time => time.UtcDateTime.ToString("yyyy-MM-dd HH:mm:ss 'UTC'", CultureInfo.InvariantCulture),
        DateTime time => time.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
        IEnumerable items => ReadList(items),
        IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
        _ => value.ToString()
    };

    private static string? ReadList(IEnumerable items)
    {
        var values = items.Cast<object?>().Select(Read).OfType<string>().Order(StringComparer.Ordinal).ToList();
        return values.Count == 0 ? null : string.Join(", ", values);
    }
}
