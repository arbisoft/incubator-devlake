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


namespace Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis;

/// <summary>The systems this service calls with an API token that an administrator enters in the admin portal.</summary>
public enum UpstreamSystem
{
    DevLake,
    Workstream
}

public static class UpstreamSystems
{
    public static IReadOnlyList<UpstreamSystem> All { get; } = [UpstreamSystem.DevLake, UpstreamSystem.Workstream];

    /// <summary>The name shown to people and used in error messages.</summary>
    public static string NameOf(UpstreamSystem system) => system switch
    {
        UpstreamSystem.DevLake => "DevLake",
        UpstreamSystem.Workstream => "Workstream",
        _ => throw new ArgumentOutOfRangeException(nameof(system), system, "Unknown upstream system.")
    };

    /// <summary>The SecretStoreEntries reference the token is saved under.</summary>
    public static string SecretRefOf(UpstreamSystem system) => system switch
    {
        UpstreamSystem.DevLake => "upstream.devlake.api-token",
        UpstreamSystem.Workstream => "upstream.workstream.api-token",
        _ => throw new ArgumentOutOfRangeException(nameof(system), system, "Unknown upstream system.")
    };
}
