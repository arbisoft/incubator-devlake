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

using Arbisoft.DevLake.IntegrationService.Business.Services.Processing;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis.DevLake;
using NSubstitute;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.Business.Processing;

public class ProcessingPreflightTests
{
    private readonly IDevLakeClient _devLake = Substitute.For<IDevLakeClient>();
    private readonly ProcessingPreflight _preflight;

    public ProcessingPreflightTests()
    {
        _devLake.IsTokenValidAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(true);
        _preflight = new ProcessingPreflight(_devLake);
    }

    [Fact]
    public async Task WhenDevLakeAcceptsOurToken_ProcessingMayGoAhead()
    {
        var result = await _preflight.RunAsync(CancellationToken.None);

        Assert.True(result.Ready);
        Assert.Null(result.Problem);
    }

    [Fact]
    public async Task WhenDevLakeRefusesTheToken_ProcessingStops()
    {
        _devLake.IsTokenValidAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(false);

        var result = await _preflight.RunAsync(CancellationToken.None);

        Assert.False(result.Ready);
        Assert.Contains("DevLake rejected", result.Problem, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(typeof(ExternalApiUnavailableException))]
    [InlineData(typeof(ExternalApiResponseException))]
    public async Task WhenDevLakeCannotBeChecked_ProcessingStops_WithTheReason(Type failure)
    {
        Exception exception = failure == typeof(ExternalApiUnavailableException)
            ? new ExternalApiUnavailableException("DevLake", "DevLake did not answer", 503)
            : new ExternalApiResponseException("DevLake", "DevLake did not answer");
        _devLake.IsTokenValidAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(Task.FromException<bool>(exception));

        var result = await _preflight.RunAsync(CancellationToken.None);

        Assert.False(result.Ready);
        Assert.Contains("DevLake did not answer", result.Problem, StringComparison.Ordinal);
    }

    [Fact]
    public async Task EachRun_UsesAFreshRunIdAsTheCorrelationId()
    {
        var ids = new List<string>();
        await _devLake.IsTokenValidAsync(Arg.Do<string>(ids.Add), Arg.Any<CancellationToken>());

        await _preflight.RunAsync(CancellationToken.None);
        await _preflight.RunAsync(CancellationToken.None);

        Assert.Equal(2, ids.Distinct().Count());
        Assert.All(ids, id => Assert.True(Guid.TryParse(id, out _)));
    }
}
