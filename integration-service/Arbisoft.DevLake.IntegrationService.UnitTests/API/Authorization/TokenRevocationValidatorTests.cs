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

using Arbisoft.DevLake.IntegrationService.API.Authorization;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using NSubstitute;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.API.Authorization;

public class TokenRevocationValidatorTests
{
    private readonly IAccessTokenRepository _accessTokens = Substitute.For<IAccessTokenRepository>();
    private readonly TokenRevocationValidator _validator;

    public TokenRevocationValidatorTests()
    {
        _validator = new TokenRevocationValidator(_accessTokens, NullLogger<TokenRevocationValidator>.Instance);
    }

    private static TokenValidatedContext ContextFor(string? jti)
    {
        var handler = new JsonWebTokenHandler();
        var claims = new Dictionary<string, object>();
        if (jti is not null)
        {
            claims[JwtRegisteredClaimNames.Jti] = jti;
        }

        var token = handler.CreateToken(new SecurityTokenDescriptor
        {
            Claims = claims,
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(new byte[32]), SecurityAlgorithms.HmacSha256)
        });
        var scheme = new AuthenticationScheme("Bearer", displayName: null, typeof(JwtBearerHandler));
        return new TokenValidatedContext(new DefaultHttpContext(), scheme, new JwtBearerOptions()) { SecurityToken = new JsonWebToken(token) };
    }

    private void Given(string jti, DateTimeOffset? tokenRevokedOn = null, bool? clientIsActive = true, long? secretId = 5, DateTimeOffset? secretRevokedOn = null) =>
        _accessTokens.GetValidityByJtiAsync(jti, Arg.Any<CancellationToken>()).Returns(new AccessTokenValidity
        {
            ClientRefId = 1,
            TokenRevokedOn = tokenRevokedOn,
            ClientIsActive = clientIsActive,
            SecretId = secretId,
            SecretRevokedOn = secretRevokedOn
        });

    private async Task<string?> FailureForAsync(string? jti)
    {
        var context = ContextFor(jti);
        await _validator.ValidateAsync(context);
        return context.Result?.Failure?.Message;
    }

    [Fact]
    public async Task IssuedAndNotRevoked_Passes()
    {
        Given("jti-1");

        Assert.Null(await FailureForAsync("jti-1"));
    }

    [Fact]
    public async Task OfAClientThatIsNoLongerActive_IsRejected()
    {
        Given("jti-2", clientIsActive: false);

        Assert.Contains("not active", await FailureForAsync("jti-2"), StringComparison.Ordinal);
    }

    [Fact]
    public async Task OfAClientThatNoLongerExists_IsRejected()
    {
        Given("jti-3", clientIsActive: null);

        Assert.NotNull(await FailureForAsync("jti-3"));
    }

    [Fact]
    public async Task Revoked_IsRejected()
    {
        Given("jti-1", tokenRevokedOn: DateTimeOffset.UtcNow);

        Assert.Contains("revoked", await FailureForAsync("jti-1"), StringComparison.Ordinal);
    }

    /// <summary>A token issued while its secret was being revoked escapes the bulk revocation of that secret's tokens; this check still stops it.</summary>
    [Fact]
    public async Task IssuedWithASecretThatHasSinceBeenRevoked_IsRejected_EvenIfTheTokenItselfWasNot()
    {
        Given("jti-4", secretRevokedOn: DateTimeOffset.UtcNow);

        Assert.Contains("client secret", await FailureForAsync("jti-4"), StringComparison.Ordinal);
    }

    [Fact]
    public async Task IssuedWithASecretThatNoLongerExists_IsRejected()
    {
        Given("jti-5", secretId: null);

        Assert.NotNull(await FailureForAsync("jti-5"));
    }

    [Fact]
    public async Task NeverIssuedByThisService_IsRejected()
    {
        _accessTokens.GetValidityByJtiAsync("ghost", Arg.Any<CancellationToken>()).Returns((AccessTokenValidity?)null);

        Assert.Contains("not issued", await FailureForAsync("ghost"), StringComparison.Ordinal);
    }

    [Fact]
    public async Task WithoutAJti_IsRejectedWithoutQueryingTheDatabase()
    {
        Assert.NotNull(await FailureForAsync(jti: null));

        await _accessTokens.DidNotReceiveWithAnyArgs().GetValidityByJtiAsync(default!, default);
    }
}
