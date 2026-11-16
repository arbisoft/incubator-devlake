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
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.Extensions.Caching.Memory;

namespace Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis;

/// <summary>
/// Reads the tokens from the encrypted secret store. A token is cached for <see cref="CacheFor"/>, so a token saved in the admin portal (a separate
/// process) reaches the API within that time without a restart, while a busy run does not read the database on every call. A missing token is not
/// cached, so one entered for the first time is used at once.
/// </summary>
public sealed class UpstreamTokenProvider : IUpstreamTokenProvider
{
    public static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(60);

    private const string CachePrefix = "upstream-token:";

    private readonly ISecretStoreRepository _secrets;
    private readonly ISecretDecryptor _decryptor;
    private readonly IMemoryCache _cache;

    public UpstreamTokenProvider(ISecretStoreRepository secrets, ISecretDecryptor decryptor, IMemoryCache cache)
    {
        _secrets = secrets;
        _decryptor = decryptor;
        _cache = cache;
    }

    public async Task<string> GetAsync(UpstreamSystem system, CancellationToken cancellationToken)
    {
        var key = CachePrefix + UpstreamSystems.SecretRefOf(system);
        if (_cache.TryGetValue(key, out string? cached) && cached is not null)
        {
            return cached;
        }

        var name = UpstreamSystems.NameOf(system);
        var stored = await _secrets.GetEncryptedValueAsync(UpstreamSystems.SecretRefOf(system), cancellationToken)
            ?? throw new ExternalAuthenticationException(name, $"No {name} API token is set. Enter it on the admin portal's Upstream tokens page.");

        string token;
        try
        {
            token = _decryptor.Decrypt(stored);
        }
        catch (CryptographicException exception)
        {
            throw new ExternalAuthenticationException(
                name, $"The stored {name} API token cannot be decrypted. Check the encryption key, then enter the token again in the admin portal.", null, exception);
        }

        _cache.Set(key, token, CacheFor);
        return token;
    }

    public void Invalidate(UpstreamSystem system) => _cache.Remove(CachePrefix + UpstreamSystems.SecretRefOf(system));
}
