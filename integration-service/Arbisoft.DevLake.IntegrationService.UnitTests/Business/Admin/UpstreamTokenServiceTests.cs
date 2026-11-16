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


using Arbisoft.DevLake.IntegrationService.Business.Security;
using Arbisoft.DevLake.IntegrationService.Business.Services.Admin;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis.DevLake;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis.Workstream;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.Business.Admin;

public class UpstreamTokenServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 16, 12, 0, 0, TimeSpan.Zero);

    private readonly ISecretStoreRepository _secrets = Substitute.For<ISecretStoreRepository>();
    private readonly ISecretEncryptor _encryptor = Substitute.For<ISecretEncryptor>();
    private readonly IUpstreamTokenProvider _tokens = Substitute.For<IUpstreamTokenProvider>();
    private readonly IDevLakeClient _devLake = Substitute.For<IDevLakeClient>();
    private readonly IWorkstreamClient _workstream = Substitute.For<IWorkstreamClient>();
    private readonly UpstreamTokenService _service;

    public UpstreamTokenServiceTests()
    {
        _encryptor.Encrypt(Arg.Any<string>()).Returns(call => "enc:" + call.Arg<string>());
        _service = new UpstreamTokenService(_secrets, _encryptor, _tokens, _devLake, _workstream, new FakeTimeProvider(Now));
    }

    [Fact]
    public async Task List_ShowsForEachSystemWhetherATokenIsSet_AndWhenAndByWhomItWasLastSaved()
    {
        _secrets.GetInfoAsync(UpstreamSystems.SecretRefOf(UpstreamSystem.DevLake), Arg.Any<CancellationToken>())
            .Returns(new SecretStoreEntryInfo { CreatedOn = Now.AddDays(-2), ModifiedOn = Now.AddDays(-1), ModifiedBy = "alice" });
        _secrets.GetInfoAsync(UpstreamSystems.SecretRefOf(UpstreamSystem.Workstream), Arg.Any<CancellationToken>()).Returns((SecretStoreEntryInfo?)null);

        var rows = await _service.ListAsync(CancellationToken.None);

        Assert.Equal(new[] { UpstreamSystem.DevLake, UpstreamSystem.Workstream }, rows.Select(r => r.System));
        Assert.Equal(("DevLake", true, Now.AddDays(-1), "alice"), (rows[0].Name, rows[0].IsSet, rows[0].SavedOn, rows[0].SavedBy));
        Assert.Equal(("Workstream", false, (DateTimeOffset?)null), (rows[1].Name, rows[1].IsSet, rows[1].SavedOn));
    }

    [Fact]
    public async Task Save_StoresTheTrimmedTokenEncrypted_UnderTheSystemsReference_WithWhoSavedIt_AndDropsTheCachedOne()
    {
        var result = await _service.SaveAsync(UpstreamSystem.Workstream, "  ws-token  ", "alice", CancellationToken.None);

        Assert.True(result.Succeeded);
        await _secrets.Received(1).SaveEncryptedValueAsync(UpstreamSystems.SecretRefOf(UpstreamSystem.Workstream), "enc:ws-token", Now, Arg.Any<CancellationToken>(), "alice");
        _tokens.Received(1).Invalidate(UpstreamSystem.Workstream);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("two words")]
    public async Task Save_AMissingOrMalformedToken_IsRefused_AndNothingIsStored(string? token)
    {
        var result = await _service.SaveAsync(UpstreamSystem.DevLake, token, "alice", CancellationToken.None);

        Assert.False(result.Succeeded);
        await _secrets.DidNotReceiveWithAnyArgs().SaveEncryptedValueAsync(default!, default!, default, default, default);
    }

    [Fact]
    public async Task Save_AnOverlongToken_IsRefused()
    {
        Assert.False((await _service.SaveAsync(UpstreamSystem.DevLake, new string('x', UpstreamTokenService.MaxTokenLength + 1), "alice", CancellationToken.None)).Succeeded);
    }

    [Fact]
    public async Task Check_AsksTheRightSystem_AndReportsWhetherItAcceptedTheToken()
    {
        _devLake.IsTokenValidAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(true);
        _workstream.IsTokenValidAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(false);

        var devLake = await _service.CheckAsync(UpstreamSystem.DevLake, CancellationToken.None);
        var workstream = await _service.CheckAsync(UpstreamSystem.Workstream, CancellationToken.None);

        Assert.Equal((true, "DevLake accepted the token."), (devLake.Succeeded, devLake.Value));
        Assert.False(workstream.Succeeded);
        Assert.Contains("Workstream refused the token", workstream.Error, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Check_AnUnreachableSystemOrAMissingToken_IsReportedWithTheReason()
    {
        _devLake.IsTokenValidAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromException<bool>(new ExternalApiUnavailableException("DevLake", "DevLake was unavailable (503).", 503)));

        var result = await _service.CheckAsync(UpstreamSystem.DevLake, CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal("DevLake was unavailable (503).", result.Error);
    }
}
