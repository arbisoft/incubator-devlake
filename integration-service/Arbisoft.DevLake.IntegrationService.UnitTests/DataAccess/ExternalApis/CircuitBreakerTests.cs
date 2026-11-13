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

using System.Net;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis;
using Arbisoft.DevLake.IntegrationService.UnitTests.TestHelpers;
using Polly.CircuitBreaker;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.DataAccess.ExternalApis;

/// <summary>The real pipelines: a breaker opens after two failures in a row and stays open for a minute.</summary>
public sealed class CircuitBreakerTests : IDisposable
{
    private const string FailingHost = "https://failing-client.test/cb";
    private const string HealthyHost = "https://healthy-client.test/cb";

    private readonly ExternalApiHost _host = new(new Dictionary<string, string?>
    {
        ["Resilience:MaxRetries"] = "0",
        ["Resilience:BreakerMinimumThroughput"] = "2",
        ["Resilience:BreakerFailureRatio"] = "0.5",
        ["Resilience:BreakerBreakSeconds"] = "60"
    });

    public CircuitBreakerTests()
    {
        _host.Handler.Then((request, _) => Task.FromResult(new HttpResponseMessage(
            request.RequestUri!.Host.StartsWith("failing", StringComparison.Ordinal) ? HttpStatusCode.InternalServerError : HttpStatusCode.OK)));
    }

    public void Dispose()
    {
        _host.Dispose();
    }

    private async Task<HttpStatusCode> PostAsync(string clientName, string url)
    {
        using var client = _host.HttpClientFactory.CreateClient(clientName);
        using var response = await client.PostAsync(new Uri(url), new StringContent("{}"));
        return response.StatusCode;
    }

    private async Task OpenTheBreakerAsync(string clientName, string url)
    {
        Assert.Equal(HttpStatusCode.InternalServerError, await PostAsync(clientName, url));
        Assert.Equal(HttpStatusCode.InternalServerError, await PostAsync(clientName, url));
        await Assert.ThrowsAsync<BrokenCircuitException>(() => PostAsync(clientName, url));
    }

    [Theory]
    [InlineData(ExternalHttpClients.SophiaCallback)]
    [InlineData(ExternalHttpClients.SophiaToken)]
    public async Task OneClientsFailingEndpoint_OpensOnlyItsOwnBreaker_SoOtherClientsAreStillReached(string clientName)
    {
        await OpenTheBreakerAsync(clientName, FailingHost);

        Assert.Equal(HttpStatusCode.OK, await PostAsync(clientName, HealthyHost));
        Assert.Equal(HttpStatusCode.OK, await PostAsync(clientName, HealthyHost + "/another-path"));
        await Assert.ThrowsAsync<BrokenCircuitException>(() => PostAsync(clientName, FailingHost + "/another-path"));
    }

    /// <summary>The control case: DevLake has one host, so its client keeps one breaker whatever URL is called.</summary>
    [Fact]
    public async Task TheDevLakeClient_KeepsOneBreaker()
    {
        await OpenTheBreakerAsync(ExternalHttpClients.DevLake, FailingHost);

        await Assert.ThrowsAsync<BrokenCircuitException>(() => PostAsync(ExternalHttpClients.DevLake, HealthyHost));
    }
}
