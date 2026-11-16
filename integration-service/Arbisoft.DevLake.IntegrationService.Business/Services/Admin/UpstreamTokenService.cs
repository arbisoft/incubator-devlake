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


using Arbisoft.DevLake.IntegrationService.Business.Dtos.Admin;
using Arbisoft.DevLake.IntegrationService.Business.Security;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis.DevLake;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis.Workstream;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Admin;

public interface IUpstreamTokenService
{
    /// <summary>Every system's token status, without the tokens.</summary>
    Task<IReadOnlyList<UpstreamTokenDto>> ListAsync(CancellationToken cancellationToken);

    /// <summary>Encrypts and saves a system's API token, replacing the one stored before. The API uses it within a minute, without a restart.</summary>
    Task<AdminResult> SaveAsync(UpstreamSystem system, string? token, string savedBy, CancellationToken cancellationToken);

    /// <summary>Asks the system's <c>is_valid</c> endpoint whether it accepts the stored token. The value is a message for the admin.</summary>
    Task<AdminResult<string>> CheckAsync(UpstreamSystem system, CancellationToken cancellationToken);
}

/// <summary>
/// The DevLake and Workstream API tokens, entered by an administrator instead of kept in configuration. They are stored AES-256-GCM encrypted in
/// SecretStoreEntries, like the signing keys, and are write-only: the portal shows whether one is set and when, never the value.
/// </summary>
public sealed class UpstreamTokenService : IUpstreamTokenService
{
    public const int MaxTokenLength = 4096;

    private readonly ISecretStoreRepository _secrets;
    private readonly ISecretEncryptor _encryptor;
    private readonly IUpstreamTokenProvider _tokens;
    private readonly IDevLakeClient _devLake;
    private readonly IWorkstreamClient _workstream;
    private readonly TimeProvider _timeProvider;

    public UpstreamTokenService(
        ISecretStoreRepository secrets,
        ISecretEncryptor encryptor,
        IUpstreamTokenProvider tokens,
        IDevLakeClient devLake,
        IWorkstreamClient workstream,
        TimeProvider timeProvider)
    {
        _secrets = secrets;
        _encryptor = encryptor;
        _tokens = tokens;
        _devLake = devLake;
        _workstream = workstream;
        _timeProvider = timeProvider;
    }

    public async Task<IReadOnlyList<UpstreamTokenDto>> ListAsync(CancellationToken cancellationToken)
    {
        var rows = new List<UpstreamTokenDto>();
        foreach (var system in UpstreamSystems.All)
        {
            var info = await _secrets.GetInfoAsync(UpstreamSystems.SecretRefOf(system), cancellationToken);
            rows.Add(new UpstreamTokenDto(system, UpstreamSystems.NameOf(system), info is not null, info?.ModifiedOn ?? info?.CreatedOn, info?.ModifiedBy));
        }

        return rows;
    }

    public async Task<AdminResult> SaveAsync(UpstreamSystem system, string? token, string savedBy, CancellationToken cancellationToken)
    {
        var value = token?.Trim();
        if (string.IsNullOrEmpty(value))
        {
            return AdminResult.Fail("Enter the token.");
        }

        if (value.Length > MaxTokenLength || value.Any(char.IsWhiteSpace))
        {
            return AdminResult.Fail($"A token is one word of at most {MaxTokenLength} characters.");
        }

        await _secrets.SaveEncryptedValueAsync(UpstreamSystems.SecretRefOf(system), _encryptor.Encrypt(value), _timeProvider.GetUtcNow(), cancellationToken, savedBy);
        _tokens.Invalidate(system);
        return AdminResult.Ok;
    }

    public async Task<AdminResult<string>> CheckAsync(UpstreamSystem system, CancellationToken cancellationToken)
    {
        var name = UpstreamSystems.NameOf(system);
        var correlationId = Guid.NewGuid().ToString("D");
        try
        {
            var valid = system == UpstreamSystem.DevLake
                ? await _devLake.IsTokenValidAsync(correlationId, cancellationToken)
                : await _workstream.IsTokenValidAsync(correlationId, cancellationToken);
            return valid
                ? AdminResult.Success($"{name} accepted the token.")
                : AdminResult.Failure<string>($"{name} refused the token. Enter a valid one.");
        }
        catch (ExternalApiException exception)
        {
            return AdminResult.Failure<string>(exception.Message);
        }
    }
}
