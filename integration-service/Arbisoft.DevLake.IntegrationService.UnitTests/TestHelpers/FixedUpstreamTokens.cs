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


using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.TestHelpers;

/// <summary>Upstream tokens held in memory, for tests of the HTTP clients that run without a database. A null token behaves as one never set.</summary>
public sealed class FixedUpstreamTokens : IUpstreamTokenProvider
{
    public FixedUpstreamTokens(string? devLake, string? workstream)
    {
        DevLake = devLake;
        Workstream = workstream;
    }

    public string? DevLake { get; set; }

    public string? Workstream { get; set; }

    public Task<string> GetAsync(UpstreamSystem system, CancellationToken cancellationToken)
    {
        var token = system == UpstreamSystem.DevLake ? DevLake : Workstream;
        var name = UpstreamSystems.NameOf(system);
        return token is null
            ? Task.FromException<string>(new ExternalAuthenticationException(name, $"No {name} API token is set. Enter it on the admin portal's Upstream tokens page."))
            : Task.FromResult(token);
    }

    public void Invalidate(UpstreamSystem system)
    {
    }
}
