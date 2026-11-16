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

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Audit;

/// <summary>
/// The fields of <typeparamref name="T"/> that the audit trail records, and how each reads. Only the listed fields are ever compared, so a field
/// added to the type later stays out of the trail until it is listed here. A hidden field, such as a secret, records only that it was set or changed.
/// </summary>
public sealed class AuditFields<T>
{
    private readonly List<(string Name, Func<T, object?> Value, bool Hidden)> _fields = [];

    /// <summary>Records <paramref name="name"/>'s old and new values.</summary>
    public AuditFields<T> Add(string name, Func<T, object?> value)
    {
        _fields.Add((name, value, false));
        return this;
    }

    /// <summary>Records only that <paramref name="name"/> was set or changed, never its value.</summary>
    public AuditFields<T> AddHidden(string name, Func<T, object?> value)
    {
        _fields.Add((name, value, true));
        return this;
    }

    /// <summary>The fields a new object was created with: every listed field that has a value.</summary>
    public IReadOnlyList<AuditChange> Created(T created)
    {
        return _fields
            .Select(field => (field, value: AuditValue.Read(field.Value(created))))
            .Where(item => item.value is not null)
            .Select(item => item.field.Hidden ? new AuditChange(item.field.Name, null, null, Hidden: true) : new AuditChange(item.field.Name, null, item.value))
            .ToList();
    }

    /// <summary>The listed fields whose value differs between <paramref name="before"/> and <paramref name="after"/>. Empty when nothing changed.</summary>
    public IReadOnlyList<AuditChange> Changed(T before, T after)
    {
        return _fields
            .Select(field => (field, old: AuditValue.Read(field.Value(before)), now: AuditValue.Read(field.Value(after))))
            .Where(item => !string.Equals(item.old, item.now, StringComparison.Ordinal))
            .Select(item => item.field.Hidden ? new AuditChange(item.field.Name, null, null, Hidden: true) : new AuditChange(item.field.Name, item.old, item.now))
            .ToList();
    }
}
