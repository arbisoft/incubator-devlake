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
using Arbisoft.DevLake.IntegrationService.Business.Services.Admin;
using Arbisoft.DevLake.IntegrationService.Business.Services.Audit;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Persistence;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Arbisoft.DevLake.IntegrationService.UnitTests.TestHelpers;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.Business.Admin;

public class PortalUserServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 16, 9, 0, 0, TimeSpan.Zero);
    private static readonly string[] Arbisoft = ["arbisoft.com"];

    private readonly IPortalUserRepository _users = Substitute.For<IPortalUserRepository>();
    private readonly ClientSecretHasher _hasher = new();
    private readonly IDbSession _session = Substitute.For<IDbSession>();
    private readonly RecordingAuditTrail _audit = new();
    private readonly PortalUserService _service;

    public PortalUserServiceTests()
    {
        _service = new PortalUserService(_users, _hasher, _session, _audit, new FakeTimeProvider(Now));
    }

    private PortalUser Local(long id, string password, string role = PortalRole.Admin, bool active = true, bool mustChange = false) => new()
    {
        Id = id,
        Username = "admin",
        PasswordHash = _hasher.Hash(password),
        Role = role,
        IsActive = active,
        MustChangePassword = mustChange
    };

    [Fact]
    public async Task LocalSignIn_WithTheRightPassword_SignsInAndRecordsIt()
    {
        _users.GetByUsernameAsync("admin", Arg.Any<CancellationToken>()).Returns(Local(1, "admin", mustChange: true));

        var signIn = await _service.SignInLocalAsync(" admin ", "admin", CancellationToken.None);

        Assert.Equal(new PortalSignIn(1, "admin", PortalRole.Admin, true), signIn);
        await _users.Received(1).RecordSignInAsync(1, null, Now, Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData("admin", "wrong")]
    [InlineData("nobody", "admin")]
    [InlineData("", "")]
    public async Task LocalSignIn_WithAWrongUsernameOrPassword_IsRefused(string username, string password)
    {
        _users.GetByUsernameAsync("admin", Arg.Any<CancellationToken>()).Returns(Local(1, "admin"));

        Assert.Null(await _service.SignInLocalAsync(username, password, CancellationToken.None));
        await _users.DidNotReceiveWithAnyArgs().RecordSignInAsync(default, default, default, default);
    }

    [Fact]
    public async Task LocalSignIn_ToADisabledAccount_IsRefused()
    {
        _users.GetByUsernameAsync("admin", Arg.Any<CancellationToken>()).Returns(Local(1, "admin", active: false));

        Assert.Null(await _service.SignInLocalAsync("admin", "admin", CancellationToken.None));
    }

    [Fact]
    public async Task SsoSignIn_TheFirstTime_CreatesTheAccountWithNoAccess()
    {
        _users.TryInsertAsync(Arg.Any<PortalUser>(), Arg.Any<CancellationToken>()).Returns(5L);
        _users.GetByIdAsync(5, Arg.Any<CancellationToken>()).Returns(new PortalUser { Id = 5, Email = "jane.doe@arbisoft.com", Role = PortalRole.None, IsActive = true });

        var result = await _service.SignInWithSsoAsync("Jane.Doe@Arbisoft.com", " Jane Doe ", Arbisoft, CancellationToken.None);

        Assert.Equal(SsoSignInOutcome.SignedIn, result.Outcome);
        Assert.Equal(new PortalSignIn(5, "jane.doe@arbisoft.com", PortalRole.None, false), result.SignIn);
        await _users.Received(1).TryInsertAsync(
            Arg.Is<PortalUser>(u => u.Email == "jane.doe@arbisoft.com" && u.DisplayName == "Jane Doe" && u.Role == PortalRole.None && u.Username == null && u.PasswordHash == null),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task SsoSignIn_RacingAnotherFirstSignIn_UsesTheAccountThatWon()
    {
        var existing = new PortalUser { Id = 9, Email = "jane.doe@arbisoft.com", Role = PortalRole.None, IsActive = true };
        _users.GetByEmailAsync("jane.doe@arbisoft.com", Arg.Any<CancellationToken>()).Returns(null, existing);
        _users.TryInsertAsync(Arg.Any<PortalUser>(), Arg.Any<CancellationToken>()).Returns((long?)null);

        var result = await _service.SignInWithSsoAsync("jane.doe@arbisoft.com", null, Arbisoft, CancellationToken.None);

        Assert.Equal(9, result.SignIn!.UserId);
    }

    [Fact]
    public async Task SsoSignIn_ForAKnownAccount_KeepsItsRoleAndRecordsTheSignIn()
    {
        _users.GetByEmailAsync("jane.doe@arbisoft.com", Arg.Any<CancellationToken>())
            .Returns(new PortalUser { Id = 3, Email = "jane.doe@arbisoft.com", Role = PortalRole.Editor, IsActive = true });

        var result = await _service.SignInWithSsoAsync("jane.doe@arbisoft.com", "Jane", Arbisoft, CancellationToken.None);

        Assert.Equal(PortalRole.Editor, result.SignIn!.Role);
        await _users.Received(1).RecordSignInAsync(3, "Jane", Now, Arg.Any<CancellationToken>());
        await _users.DidNotReceiveWithAnyArgs().TryInsertAsync(default!, default);
    }

    [Theory]
    [InlineData("someone@gmail.com")]
    [InlineData("someone@arbisoft.com.evil.example")]
    [InlineData(null)]
    public async Task SsoSignIn_OutsideTheAllowedDomains_IsRefusedWithoutCreatingAnAccount(string? email)
    {
        var result = await _service.SignInWithSsoAsync(email, "Someone", Arbisoft, CancellationToken.None);

        Assert.Equal(SsoSignInOutcome.NotAllowed, result.Outcome);
        await _users.DidNotReceiveWithAnyArgs().TryInsertAsync(default!, default);
    }

    [Fact]
    public async Task SsoSignIn_ToADisabledAccount_IsRefused()
    {
        _users.GetByEmailAsync("jane.doe@arbisoft.com", Arg.Any<CancellationToken>())
            .Returns(new PortalUser { Id = 3, Email = "jane.doe@arbisoft.com", Role = PortalRole.Editor, IsActive = false });

        var result = await _service.SignInWithSsoAsync("jane.doe@arbisoft.com", null, Arbisoft, CancellationToken.None);

        Assert.Equal(SsoSignInOutcome.Disabled, result.Outcome);
        Assert.Null(result.SignIn);
    }

    [Fact]
    public async Task ChangePassword_WithTheRightCurrentPassword_StoresANewHash()
    {
        _users.GetByIdAsync(1, Arg.Any<CancellationToken>()).Returns(Local(1, "admin", mustChange: true));

        var result = await _service.ChangePasswordAsync(1, "admin", "a much better password", "a much better password", CancellationToken.None);

        Assert.True(result.Succeeded);
        await _users.Received(1).UpdatePasswordAsync(
            1, Arg.Is<string>(h => _hasher.Verify("a much better password", h)), "admin", Now, Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData("wrong", "a much better password", "a much better password")]
    [InlineData("admin", "short", "short")]
    [InlineData("admin", "a much better password", "a different password!")]
    [InlineData("admin", "ADMINADMINADMIN", "ADMINADMINADMIN")]
    public async Task ChangePassword_IsRefused_ForAWrongCurrentOrAWeakOrMismatchedNewPassword(string current, string next, string confirm)
    {
        var user = Local(1, "admin");
        _users.GetByIdAsync(1, Arg.Any<CancellationToken>()).Returns(next == "ADMINADMINADMIN" ? new PortalUser
        {
            Id = 1,
            Username = "adminadminadmin",
            PasswordHash = user.PasswordHash,
            Role = PortalRole.Admin,
            IsActive = true
        } : user);

        var result = await _service.ChangePasswordAsync(1, current, next, confirm, CancellationToken.None);

        Assert.False(result.Succeeded);
        await _users.DidNotReceiveWithAnyArgs().UpdatePasswordAsync(default, default!, default!, default, default);
    }

    [Fact]
    public async Task ChangePassword_ForASingleSignOnAccount_IsRefused()
    {
        _users.GetByIdAsync(3, Arg.Any<CancellationToken>()).Returns(new PortalUser { Id = 3, Email = "jane.doe@arbisoft.com", IsActive = true });

        var result = await _service.ChangePasswordAsync(3, "x", "a much better password", "a much better password", CancellationToken.None);

        Assert.False(result.Succeeded);
    }

    [Fact]
    public async Task SetAccess_GrantsEditorToANewUser()
    {
        _users.GetByIdAsync(3, Arg.Any<CancellationToken>()).Returns(new PortalUser { Id = 3, Email = "jane.doe@arbisoft.com", Role = PortalRole.None, IsActive = true });

        var result = await _service.SetAccessAsync(3, PortalRole.Editor, true, 1, TestActors.User("admin"), CancellationToken.None);

        Assert.True(result.Succeeded);
        await _users.Received(1).UpdateAccessAsync(3, PortalRole.Editor, true, "admin", Now, Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData(PortalRole.Editor, true)]
    [InlineData(PortalRole.Admin, false)]
    public async Task SetAccess_NeverRemovesTheLastActiveAdministrator(string role, bool isActive)
    {
        _users.GetByIdAsync(2, Arg.Any<CancellationToken>()).Returns(Local(2, "x"));
        _users.CountActiveAdminsAsync(Arg.Any<CancellationToken>()).Returns(1);

        var result = await _service.SetAccessAsync(2, role, isActive, 1, TestActors.User("admin"), CancellationToken.None);

        Assert.False(result.Succeeded);
        await _users.DidNotReceiveWithAnyArgs().UpdateAccessAsync(default, default!, default, default!, default, default);
    }

    [Fact]
    public async Task SetAccess_DemotesAnAdministrator_WhenAnotherRemains()
    {
        _users.GetByIdAsync(2, Arg.Any<CancellationToken>()).Returns(Local(2, "x"));
        _users.CountActiveAdminsAsync(Arg.Any<CancellationToken>()).Returns(2);

        Assert.True((await _service.SetAccessAsync(2, PortalRole.Editor, true, 1, TestActors.User("admin"), CancellationToken.None)).Succeeded);
    }

    [Theory]
    [InlineData(1L, PortalRole.Editor)]
    [InlineData(3L, "Owner")]
    [InlineData(3L, null)]
    public async Task SetAccess_RefusesOwnAccessOrAnUnknownRole(long userId, string? role)
    {
        var result = await _service.SetAccessAsync(userId, role, true, 1, TestActors.User("admin"), CancellationToken.None);

        Assert.False(result.Succeeded);
        await _users.DidNotReceiveWithAnyArgs().UpdateAccessAsync(default, default!, default, default!, default, default);
    }

    [Fact]
    public async Task Current_IsNull_ForADisabledOrRemovedAccount()
    {
        _users.GetByIdAsync(2, Arg.Any<CancellationToken>()).Returns(Local(2, "x", active: false));

        Assert.Null(await _service.GetCurrentAsync(2, CancellationToken.None));
        Assert.Null(await _service.GetCurrentAsync(99, CancellationToken.None));
    }

    [Fact]
    public async Task SetAccess_IsRecordedAgainstTheUser_WithTheOldAndNewAccess()
    {
        _users.GetByIdAsync(3, Arg.Any<CancellationToken>()).Returns(new PortalUser { Id = 3, Email = "jane.doe@arbisoft.com", Role = PortalRole.None, IsActive = true });

        await _service.SetAccessAsync(3, PortalRole.Editor, true, 1, TestActors.User("admin"), CancellationToken.None);

        var entry = _audit.OnlyEntry;
        Assert.Equal((AuditActions.AccessChanged, AuditEntityTypes.PortalUser, "3", "jane.doe@arbisoft.com"), (entry.Action, entry.EntityType, entry.EntityId, entry.EntityLabel));
        Assert.Equal([new AuditChange("Access", PortalRole.None, PortalRole.Editor)], entry.Changes!);
    }

    [Fact]
    public async Task SetAccess_Refused_RecordsNothing()
    {
        await _service.SetAccessAsync(1, PortalRole.Editor, true, 1, TestActors.User("admin"), CancellationToken.None);

        Assert.Empty(_audit.Recorded);
    }
}
