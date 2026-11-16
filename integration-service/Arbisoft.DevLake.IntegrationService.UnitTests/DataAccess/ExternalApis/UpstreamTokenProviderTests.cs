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


using System.Security.Cryptography;
using Arbisoft.DevLake.IntegrationService.DataAccess;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.Extensions.Caching.Memory;
using NSubstitute;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.DataAccess.ExternalApis;

public sealed class UpstreamTokenProviderTests : IDisposable
{
    private readonly ISecretStoreRepository _secrets = Substitute.For<ISecretStoreRepository>();
    private readonly ISecretDecryptor _decryptor = Substitute.For<ISecretDecryptor>();
    private readonly MemoryCache _cache = new(new MemoryCacheOptions());
    private readonly UpstreamTokenProvider _provider;

    public UpstreamTokenProviderTests()
    {
        _decryptor.Decrypt(Arg.Any<string>()).Returns(call => "plain:" + call.Arg<string>());
        _provider = new UpstreamTokenProvider(_secrets, _decryptor, _cache);
    }

    public void Dispose()
    {
        _cache.Dispose();
    }

    private void Stored(UpstreamSystem system, string? encrypted) =>
        _secrets.GetEncryptedValueAsync(UpstreamSystems.SecretRefOf(system), Arg.Any<CancellationToken>()).Returns(encrypted);

    [Fact]
    public async Task EachSystemsToken_IsReadFromItsOwnEntry_AndDecrypted()
    {
        Stored(UpstreamSystem.DevLake, "enc-d");
        Stored(UpstreamSystem.Workstream, "enc-w");

        Assert.Equal("plain:enc-d", await _provider.GetAsync(UpstreamSystem.DevLake, CancellationToken.None));
        Assert.Equal("plain:enc-w", await _provider.GetAsync(UpstreamSystem.Workstream, CancellationToken.None));
        Assert.NotEqual(UpstreamSystems.SecretRefOf(UpstreamSystem.DevLake), UpstreamSystems.SecretRefOf(UpstreamSystem.Workstream));
    }

    [Fact]
    public async Task AToken_IsCached_SoABusyRunDoesNotReadTheDatabaseOnEveryCall()
    {
        Stored(UpstreamSystem.DevLake, "enc-d");

        for (var i = 0; i < 5; i++)
        {
            await _provider.GetAsync(UpstreamSystem.DevLake, CancellationToken.None);
        }

        await _secrets.Received(1).GetEncryptedValueAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Invalidate_MakesTheNextCallReadTheTokenJustSaved()
    {
        Stored(UpstreamSystem.DevLake, "enc-old");
        await _provider.GetAsync(UpstreamSystem.DevLake, CancellationToken.None);
        Stored(UpstreamSystem.DevLake, "enc-new");

        _provider.Invalidate(UpstreamSystem.DevLake);

        Assert.Equal("plain:enc-new", await _provider.GetAsync(UpstreamSystem.DevLake, CancellationToken.None));
    }

    [Fact]
    public async Task NoTokenSet_IsACredentialsProblem_ThatSaysWhereToEnterIt_AndIsNotCached()
    {
        Stored(UpstreamSystem.Workstream, null);

        var problem = await Assert.ThrowsAsync<ExternalAuthenticationException>(() => _provider.GetAsync(UpstreamSystem.Workstream, CancellationToken.None));

        Assert.Contains("No Workstream API token is set", problem.Message, StringComparison.Ordinal);
        Assert.Contains("Upstream tokens", problem.Message, StringComparison.Ordinal);
        Stored(UpstreamSystem.Workstream, "enc-w");
        Assert.Equal("plain:enc-w", await _provider.GetAsync(UpstreamSystem.Workstream, CancellationToken.None));
    }

    [Fact]
    public async Task ATokenThatCannotBeDecrypted_IsACredentialsProblem_NotACrash()
    {
        Stored(UpstreamSystem.DevLake, "enc-d");
        _decryptor.Decrypt("enc-d").Returns(_ => throw new CryptographicException("bad tag"));

        var problem = await Assert.ThrowsAsync<ExternalAuthenticationException>(() => _provider.GetAsync(UpstreamSystem.DevLake, CancellationToken.None));

        Assert.Contains("cannot be decrypted", problem.Message, StringComparison.Ordinal);
    }
}
