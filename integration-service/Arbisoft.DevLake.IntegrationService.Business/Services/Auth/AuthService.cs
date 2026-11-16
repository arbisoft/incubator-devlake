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

using System.Text.RegularExpressions;
using Arbisoft.DevLake.IntegrationService.Business.Dtos.Auth;
using Arbisoft.DevLake.IntegrationService.Business.Security;
using Arbisoft.DevLake.IntegrationService.Business.Services.Audit;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Persistence;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.Extensions.Logging;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Auth;

public sealed partial class AuthService : IAuthService
{
    private const int MaxLoggedClientIdLength = 100;
    private const string DummySecret = "unused-secret-for-timing";

    /// <summary>A refused token request whose client ID matches no client is recorded against no client.</summary>
    private static readonly AuditSubject UnknownClient = new(AuditEntityTypes.Client, AuditActor.UnknownUserName, null);

    private readonly IClientRepository _clients;
    private readonly IAccessTokenRepository _accessTokens;
    private readonly IClientSecretHasher _hasher;
    private readonly ITokenGenerator _tokenGenerator;
    private readonly IDbSession _session;
    private readonly IAuditTrail _audit;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<AuthService> _logger;
    private readonly Lazy<string> _dummyHash;

    public AuthService(
        IClientRepository clients,
        IAccessTokenRepository accessTokens,
        IClientSecretHasher hasher,
        ITokenGenerator tokenGenerator,
        IDbSession session,
        IAuditTrail audit,
        TimeProvider timeProvider,
        ILogger<AuthService> logger)
    {
        _clients = clients;
        _accessTokens = accessTokens;
        _hasher = hasher;
        _tokenGenerator = tokenGenerator;
        _session = session;
        _audit = audit;
        _timeProvider = timeProvider;
        _logger = logger;
        _dummyHash = new Lazy<string>(() => hasher.Hash(DummySecret));
    }

    public async Task<AuthResult> AuthenticateAsync(TokenRequest request, CancellationToken cancellationToken)
    {
        var client = await _clients.GetByClientIdAsync(request.ClientId, cancellationToken);
        if (client is null)
        {
            _hasher.Verify(request.ClientSecret, _dummyHash.Value);
            return await RefuseAsync(request, null, AuthFailureReason.UnknownClient, cancellationToken);
        }

        var secret = await FindMatchingSecretAsync(client, request.ClientSecret, cancellationToken);
        if (secret is null)
        {
            return await RefuseAsync(request, client, AuthFailureReason.InvalidSecret, cancellationToken);
        }

        if (!client.IsActive)
        {
            return await RefuseAsync(request, client, AuthFailureReason.InactiveClient, cancellationToken);
        }

        var scopes = await _clients.GetScopeNamesAsync(client.Id, cancellationToken);
        var issued = await _tokenGenerator.GenerateAsync(new TokenSpecification(client.ClientId, scopes, client.AccessTokenLifetimeSeconds), cancellationToken);
        await RecordAsync(client, secret, issued, scopes, request.CallerIp, cancellationToken);

        return AuthResult.Success(new TokenResponse(issued.AccessToken, AuthConstants.BearerTokenType, client.AccessTokenLifetimeSeconds, string.Join(' ', scopes)));
    }

    /// <summary>A secret counts when it is not revoked, not expired and matches. A client may hold several during rotation.</summary>
    private async Task<ClientSecret?> FindMatchingSecretAsync(Client client, string presentedSecret, CancellationToken cancellationToken)
    {
        var now = _timeProvider.GetUtcNow();
        var secrets = await _clients.GetSecretsAsync(client.Id, cancellationToken);
        return secrets
            .Where(secret => secret.RevokedOn is null && (secret.ExpiresOn is null || secret.ExpiresOn > now))
            .FirstOrDefault(secret => _hasher.Verify(presentedSecret, secret.Secret));
    }

    private async Task RecordAsync(
        Client client, ClientSecret secret, IssuedToken issued, IReadOnlyList<string> scopes, string callerIp, CancellationToken cancellationToken)
    {
        var token = new AccessToken
        {
            Jti = issued.Jti,
            ClientRefId = client.Id,
            ClientSecretId = secret.Id,
            SigningKeyId = issued.SigningKeyId,
            GrantedScopes = string.Join(' ', scopes),
            IssuedOn = issued.IssuedOn,
            ExpiresOn = issued.ExpiresOn,
            IssuedToIp = callerIp
        };

        List<AuditChange> changes = [new(AuditedFields.Scopes, null, AuditValue.Read(scopes)), new(AuditedFields.Expires, null, AuditValue.Read(issued.ExpiresOn))];
        await _audit.SaveChangeAsync(_session, AuditActor.Client(client.ClientId), async () =>
        {
            await _accessTokens.InsertAsync(token, cancellationToken);
            await _clients.MarkSecretUsedAsync(secret.Id, issued.IssuedOn, cancellationToken);
            return new AuditSubject(AuditEntityTypes.AccessToken, issued.Jti, client.ClientId).Did(AuditActions.TokenIssued, changes) with { IpAddress = callerIp };
        }, cancellationToken);
    }

    /// <summary>
    /// Refuses a token request and records it. A client ID that matches no client is neither logged nor recorded as sent, only that it was unknown.
    /// </summary>
    private async Task<AuthResult> RefuseAsync(TokenRequest request, Client? client, AuthFailureReason reason, CancellationToken cancellationToken)
    {
        _logger.LogWarning("Token request refused for client {ClientId}: {Reason}", Loggable(request.ClientId), reason);
        var actor = client is null ? AuditActor.UnknownClient : AuditActor.Client(client.ClientId);
        var subject = client is null ? UnknownClient : new AuditSubject(AuditEntityTypes.Client, AuditValue.Id(client.Id), client.Name);
        await _audit.RecordAsync(actor, subject.Did(AuditActions.TokenRefused, reason: Describe(reason)) with { IpAddress = request.CallerIp }, cancellationToken);
        return AuthResult.Fail(reason);
    }

    private static string Describe(AuthFailureReason reason) => reason switch
    {
        AuthFailureReason.UnknownClient => "Unknown client ID",
        AuthFailureReason.InactiveClient => "The client is inactive",
        _ => "Wrong, expired or revoked secret"
    };

    /// <summary>Caller-supplied text only reaches the log when it looks like a client ID, so it cannot forge log lines.</summary>
    private static string Loggable(string clientId)
    {
        return clientId.Length <= MaxLoggedClientIdLength && SafeClientId().IsMatch(clientId) ? clientId : "(unrecognised format)";
    }

    [GeneratedRegex("^[A-Za-z0-9._-]+$")]
    private static partial Regex SafeClientId();
}
