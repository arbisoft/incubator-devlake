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
using Arbisoft.DevLake.IntegrationService.Business.Services.Audit;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Persistence;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Admin;

public interface ISigningKeyService
{
    Task<IReadOnlyList<SigningKeyDto>> ListAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Creates a new RSA key, stores its private key encrypted in the secret store, makes it the active key and retires the previous one.
    /// Tokens signed with the old key keep verifying until they expire, because retired keys stay in the table.
    /// </summary>
    Task<AdminResult<SigningKeyDto>> RotateAsync(AuditActor actor, CancellationToken cancellationToken);
}

public sealed class SigningKeyService : ISigningKeyService
{
    private const string SecretRefPrefix = "signing-key-";

    private readonly ISigningKeyRepository _keys;
    private readonly ISecretStore _secrets;
    private readonly IDbSession _session;
    private readonly IAuditTrail _audit;
    private readonly TimeProvider _timeProvider;

    public SigningKeyService(ISigningKeyRepository keys, ISecretStore secrets, IDbSession session, IAuditTrail audit, TimeProvider timeProvider)
    {
        _keys = keys;
        _secrets = secrets;
        _session = session;
        _audit = audit;
        _timeProvider = timeProvider;
    }

    public async Task<IReadOnlyList<SigningKeyDto>> ListAsync(CancellationToken cancellationToken)
    {
        var now = _timeProvider.GetUtcNow();
        var active = await _keys.GetActiveAsync(now, cancellationToken);
        var page = await _keys.ListAsync(1, AdminPaging.MaxRows, cancellationToken);
        return page.Items.Select(key => ToDto(key, active?.Id, now)).ToList();
    }

    public async Task<AdminResult<SigningKeyDto>> RotateAsync(AuditActor actor, CancellationToken cancellationToken)
    {
        var now = _timeProvider.GetUtcNow();
        var previous = await _keys.GetActiveAsync(now, cancellationToken);
        var pair = RsaKeyPair.Generate();
        var key = NewKey(pair, now);
        long id = 0;

        // The private key, the new key, the retirement of the old one and the audit entry commit together, so a failure never leaves a key with no
        // private half.
        await _audit.SaveChangeAsync(
            _session,
            actor,
            async () =>
            {
                await _secrets.SaveAsync(key.PrivateKeyRef, pair.PrivateKeyPem, cancellationToken);
                id = await _keys.InsertAsync(key, cancellationToken);
                if (previous is not null)
                {
                    await _keys.RetireAsync(previous.Id, now, cancellationToken);
                }

                return new AuditEntry(
                    AuditActions.Rotated,
                    AuditEntityTypes.SigningKey,
                    AuditValue.Id(id),
                    key.Kid,
                    [new AuditChange(AuditedFields.ActiveKey, previous?.Kid, key.Kid), new AuditChange(AuditedFields.Algorithm, null, key.Algorithm)]);
            },
            cancellationToken);
        return AdminResult.Success(ToDto(Saved(key, id), id, now));
    }

    private static SigningKey NewKey(RsaKeyPair pair, DateTimeOffset now)
    {
        var kid = $"key-{now:yyyyMMddHHmmss}-{Guid.NewGuid():N}"[..40];
        return new SigningKey
        {
            Kid = kid,
            Algorithm = RsaKeyPair.Algorithm,
            PublicKey = pair.PublicKeyPem,
            PrivateKeyRef = SecretRefPrefix + kid,
            ActivatedOn = now,
            CreatedOn = now
        };
    }

    private static SigningKey Saved(SigningKey key, long id) => new()
    {
        Id = id,
        Kid = key.Kid,
        Algorithm = key.Algorithm,
        PublicKey = key.PublicKey,
        PrivateKeyRef = key.PrivateKeyRef,
        ActivatedOn = key.ActivatedOn,
        CreatedOn = key.CreatedOn
    };

    private static SigningKeyDto ToDto(SigningKey key, long? activeId, DateTimeOffset now)
    {
        var status = key.Id == activeId ? "Active" : key.RetiredOn is not null && key.RetiredOn <= now ? "Retired" : key.ActivatedOn > now ? "Pending" : "Retired";
        return new SigningKeyDto(key.Id, key.Kid, key.Algorithm, key.PrivateKeyRef, key.ActivatedOn, key.RetiredOn, key.CreatedOn, status);
    }
}
