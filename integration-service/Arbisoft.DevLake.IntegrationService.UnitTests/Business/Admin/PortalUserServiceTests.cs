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

    private const string Ip = "203.0.113.7";

    private static SsoSignInRequest Sso(string? email, string? name, bool verified = true) => new(email, name, verified, Arbisoft, Ip);

    [Fact]
    public async Task LocalSignIn_WithTheRightPassword_SignsInAndRecordsIt()
    {
        _users.GetByUsernameAsync("admin", Arg.Any<CancellationToken>()).Returns(Local(1, "admin", mustChange: true));

        var signIn = await _service.SignInLocalAsync(" admin ", "admin", Ip, CancellationToken.None);

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

        Assert.Null(await _service.SignInLocalAsync(username, password, Ip, CancellationToken.None));
        await _users.DidNotReceiveWithAnyArgs().RecordSignInAsync(default, default, default, default);
    }

    [Fact]
    public async Task LocalSignIn_ToADisabledAccount_IsRefused()
    {
        _users.GetByUsernameAsync("admin", Arg.Any<CancellationToken>()).Returns(Local(1, "admin", active: false));

        Assert.Null(await _service.SignInLocalAsync("admin", "admin", Ip, CancellationToken.None));
    }

    [Fact]
    public async Task SsoSignIn_TheFirstTime_CreatesTheAccountWithNoAccess()
    {
        _users.TryInsertAsync(Arg.Any<PortalUser>(), Arg.Any<CancellationToken>()).Returns(5L);
        _users.GetByIdAsync(5, Arg.Any<CancellationToken>()).Returns(new PortalUser { Id = 5, Email = "jane.doe@arbisoft.com", Role = PortalRole.None, IsActive = true });

        var result = await _service.SignInWithSsoAsync(Sso("Jane.Doe@Arbisoft.com", " Jane Doe "), CancellationToken.None);

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

        var result = await _service.SignInWithSsoAsync(Sso("jane.doe@arbisoft.com", null), CancellationToken.None);

        Assert.Equal(9, result.SignIn!.UserId);
    }

    [Fact]
    public async Task SsoSignIn_ForAKnownAccount_KeepsItsRoleAndRecordsTheSignIn()
    {
        _users.GetByEmailAsync("jane.doe@arbisoft.com", Arg.Any<CancellationToken>())
            .Returns(new PortalUser { Id = 3, Email = "jane.doe@arbisoft.com", Role = PortalRole.Editor, IsActive = true });

        var result = await _service.SignInWithSsoAsync(Sso("jane.doe@arbisoft.com", "Jane"), CancellationToken.None);

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
        var result = await _service.SignInWithSsoAsync(Sso(email, "Someone"), CancellationToken.None);

        Assert.Equal(SsoSignInOutcome.NotAllowed, result.Outcome);
        await _users.DidNotReceiveWithAnyArgs().TryInsertAsync(default!, default);
    }

    [Fact]
    public async Task SsoSignIn_ToADisabledAccount_IsRefused()
    {
        _users.GetByEmailAsync("jane.doe@arbisoft.com", Arg.Any<CancellationToken>())
            .Returns(new PortalUser { Id = 3, Email = "jane.doe@arbisoft.com", Role = PortalRole.Editor, IsActive = false });

        var result = await _service.SignInWithSsoAsync(Sso("jane.doe@arbisoft.com", null), CancellationToken.None);

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

    [Fact]
    public async Task LocalSignIn_IsRecordedAgainstTheUser_WithTheCallersAddress()
    {
        _users.GetByUsernameAsync("admin", Arg.Any<CancellationToken>()).Returns(Local(1, "admin"));

        await _service.SignInLocalAsync("admin", "admin", Ip, CancellationToken.None);

        var (actor, entry) = Assert.Single(_audit.Recorded);
        Assert.Equal(("1", "admin"), (actor.Id, actor.Name));
        Assert.Equal((AuditActions.SignedIn, AuditEntityTypes.PortalUser, "1", Ip), (entry.Action, entry.EntityType, entry.EntityId, entry.IpAddress));
        await _session.Received(1).CommitAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task LocalSignIn_AWrongPassword_IsRecordedAgainstTheAccount_ButNotInTheHoldersName()
    {
        _users.GetByUsernameAsync("admin", Arg.Any<CancellationToken>()).Returns(Local(1, "admin"));

        await _service.SignInLocalAsync("admin", "wrong", Ip, CancellationToken.None);

        var (actor, entry) = Assert.Single(_audit.Recorded);
        Assert.Equal(AuditActor.UnknownUser, actor);
        Assert.Equal((AuditActions.SignInRefused, "1", "Wrong password", Ip), (entry.Action, entry.EntityId, entry.Reason, entry.IpAddress));
    }

    [Fact]
    public async Task LocalSignIn_AnUnknownUsername_IsRecordedWithoutWhatWasTyped()
    {
        await _service.SignInLocalAsync("my-password-in-the-wrong-box", "x", Ip, CancellationToken.None);

        var (actor, entry) = Assert.Single(_audit.Recorded);
        Assert.Equal((AuditActions.SignInRefused, AuditActor.UnknownUserName, "Unknown username"), (entry.Action, entry.EntityId, entry.Reason));
        Assert.DoesNotContain("my-password", $"{actor} {entry}", StringComparison.Ordinal);
    }

    [Fact]
    public async Task SsoSignIn_TheFirstTime_RecordsTheNewAccountThenTheSignIn()
    {
        _users.TryInsertAsync(Arg.Any<PortalUser>(), Arg.Any<CancellationToken>()).Returns(5L);
        _users.GetByIdAsync(5, Arg.Any<CancellationToken>()).Returns(new PortalUser { Id = 5, Email = "jane.doe@arbisoft.com", Role = PortalRole.None, IsActive = true });

        await _service.SignInWithSsoAsync(Sso("jane.doe@arbisoft.com", "Jane"), CancellationToken.None);

        Assert.Equal([AuditActions.Created, AuditActions.SignedIn], _audit.Recorded.Select(r => r.Entry.Action));
        Assert.All(_audit.Recorded, r => Assert.Equal(("5", "jane.doe@arbisoft.com", Ip), (r.Actor.Id, r.Actor.Name, r.Entry.IpAddress)));
        Assert.Contains(new AuditChange("Access", null, PortalRole.None), _audit.Recorded[0].Entry.Changes!);
    }

    [Fact]
    public async Task SsoSignIn_LosingTheRaceToCreateTheAccount_RecordsOnlyTheSignIn()
    {
        var existing = new PortalUser { Id = 9, Email = "jane.doe@arbisoft.com", Role = PortalRole.None, IsActive = true };
        _users.GetByEmailAsync("jane.doe@arbisoft.com", Arg.Any<CancellationToken>()).Returns(null, existing);
        _users.TryInsertAsync(Arg.Any<PortalUser>(), Arg.Any<CancellationToken>()).Returns((long?)null);

        await _service.SignInWithSsoAsync(Sso("jane.doe@arbisoft.com", null), CancellationToken.None);

        Assert.Equal(AuditActions.SignedIn, _audit.OnlyEntry.Action);
    }

    [Theory]
    [InlineData("someone@gmail.com", true, "Not an allowed email domain")]
    [InlineData("jane.doe@arbisoft.com", false, "The identity provider has not verified the email")]
    public async Task SsoSignIn_Refused_IsRecordedWithoutTheEmail(string email, bool verified, string reason)
    {
        var result = await _service.SignInWithSsoAsync(Sso(email, "Someone", verified), CancellationToken.None);

        Assert.Equal(SsoSignInOutcome.NotAllowed, result.Outcome);
        var (actor, entry) = Assert.Single(_audit.Recorded);
        Assert.Equal((AuditActions.SignInRefused, reason, Ip), (entry.Action, entry.Reason, entry.IpAddress));
        Assert.DoesNotContain(email.Split('@')[0], $"{actor} {entry}", StringComparison.Ordinal);
        await _users.DidNotReceiveWithAnyArgs().TryInsertAsync(default!, default);
    }

    [Fact]
    public async Task SsoSignIn_ToADisabledAccount_IsRecordedAgainstIt_AndIsNotCountedAsASignIn()
    {
        _users.GetByEmailAsync("jane.doe@arbisoft.com", Arg.Any<CancellationToken>())
            .Returns(new PortalUser { Id = 3, Email = "jane.doe@arbisoft.com", Role = PortalRole.Editor, IsActive = false });

        await _service.SignInWithSsoAsync(Sso("jane.doe@arbisoft.com", null), CancellationToken.None);

        var (actor, entry) = Assert.Single(_audit.Recorded);
        Assert.Equal("3", actor.Id);
        Assert.Equal((AuditActions.SignInRefused, "3", "The account is disabled"), (entry.Action, entry.EntityId, entry.Reason));
        await _users.DidNotReceiveWithAnyArgs().RecordSignInAsync(default, default, default, default);
    }

    [Fact]
    public async Task SignOut_IsRecordedAgainstTheUser()
    {
        await _service.SignOutAsync(TestActors.User("admin", 4), Ip, CancellationToken.None);

        var entry = _audit.OnlyEntry;
        Assert.Equal((AuditActions.SignedOut, AuditEntityTypes.PortalUser, "4", "admin", Ip), (entry.Action, entry.EntityType, entry.EntityId, entry.EntityLabel, entry.IpAddress));
    }

    [Fact]
    public async Task ChangePassword_IsRecordedAsAHiddenChange()
    {
        _users.GetByIdAsync(1, Arg.Any<CancellationToken>()).Returns(Local(1, "admin", mustChange: true));

        await _service.ChangePasswordAsync(1, "admin", "a much better password", "a much better password", CancellationToken.None);

        var entry = _audit.OnlyEntry;
        Assert.Equal((AuditActions.PasswordChanged, "1"), (entry.Action, entry.EntityId));
        Assert.Equal([new AuditChange(AuditedFields.Password, null, null, Hidden: true)], entry.Changes!);
    }

    [Fact]
    public async Task ChangePassword_WithAWrongCurrentPassword_RecordsNothing()
    {
        _users.GetByIdAsync(1, Arg.Any<CancellationToken>()).Returns(Local(1, "admin"));

        await _service.ChangePasswordAsync(1, "wrong", "a much better password", "a much better password", CancellationToken.None);

        Assert.Empty(_audit.Recorded);
    }
}
