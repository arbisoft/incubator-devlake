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
using Arbisoft.DevLake.IntegrationService.Business.Services.Requests;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Persistence;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Admin;

public interface IPortalUserService
{
    /// <summary>
    /// Signs in a local account (the seeded administrator) with its username and password. Null when either is wrong or the account is disabled.
    /// Either way the attempt is recorded in the audit trail with <paramref name="ipAddress"/>; what was typed as the username is never recorded.
    /// </summary>
    Task<PortalSignIn?> SignInLocalAsync(string? username, string? password, string? ipAddress, CancellationToken cancellationToken);

    /// <summary>
    /// Signs in an Arbisoft account the identity provider vouched for. Its first sign-in creates it with no access, so the person sees a message to
    /// ask an administrator; only a verified email in one of the request's allowed domains is accepted. Every outcome is recorded in the audit
    /// trail, and an email that is refused is never recorded.
    /// </summary>
    Task<SsoSignInResult> SignInWithSsoAsync(SsoSignInRequest request, CancellationToken cancellationToken);

    /// <summary>Records in the audit trail that a portal user signed out.</summary>
    Task SignOutAsync(AuditActor actor, string? ipAddress, CancellationToken cancellationToken);

    /// <summary>The signed-in user as the database has them now, or null when the account was removed or disabled. Read on every request.</summary>
    Task<PortalSignIn?> GetCurrentAsync(long userId, CancellationToken cancellationToken);

    /// <summary>Changes a local account's password, after checking the current one.</summary>
    Task<AdminResult> ChangePasswordAsync(long userId, string? currentPassword, string? newPassword, string? confirmPassword, CancellationToken cancellationToken);

    Task<IReadOnlyList<PortalUserDto>> ListAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Grants or removes access: the role, and whether the account can sign in at all. Nobody changes their own access, and the last active
    /// administrator cannot be demoted or disabled, so the portal can never be left without one.
    /// </summary>
    Task<AdminResult> SetAccessAsync(long userId, string? role, bool isActive, long changedById, AuditActor actor, CancellationToken cancellationToken);
}

public sealed class PortalUserService : IPortalUserService
{
    public const int MinPasswordLength = 8;
    public const int MaxPasswordLength = 256;

    private const string SsoCreator = "sso";
    private const string ByPassword = "With a password";
    private const string BySso = "With single sign-on";
    private const string FirstSso = "First single sign-on";
    private const string RefusedUnknownUser = "Unknown username";
    private const string RefusedWrongPassword = "Wrong password";
    private const string RefusedNoPassword = "The account signs in with single sign-on";
    private const string RefusedDisabled = "The account is disabled";
    private const string RefusedDomain = "Not an allowed email domain";
    private const string RefusedUnverified = "The identity provider has not verified the email";

    /// <summary>A refused sign-in that matches no portal user is recorded against no user.</summary>
    private static readonly AuditSubject UnknownUser = new(AuditEntityTypes.PortalUser, AuditActor.UnknownUserName, null);
    private const string DummyPassword = "unused-password-for-timing";

    private readonly IPortalUserRepository _users;
    private readonly IClientSecretHasher _hasher;
    private readonly IDbSession _session;
    private readonly IAuditTrail _audit;
    private readonly TimeProvider _timeProvider;
    private readonly Lazy<string> _dummyHash;

    public PortalUserService(IPortalUserRepository users, IClientSecretHasher hasher, IDbSession session, IAuditTrail audit, TimeProvider timeProvider)
    {
        _users = users;
        _hasher = hasher;
        _session = session;
        _audit = audit;
        _timeProvider = timeProvider;
        _dummyHash = new Lazy<string>(() => hasher.Hash(DummyPassword));
    }

    public async Task<PortalSignIn?> SignInLocalAsync(string? username, string? password, string? ipAddress, CancellationToken cancellationToken)
    {
        var user = string.IsNullOrWhiteSpace(username) ? null : await _users.GetByUsernameAsync(username.Trim(), cancellationToken);

        // The hash is checked even for an unknown username, so the response time does not reveal which part was wrong.
        var matches = _hasher.Verify(password ?? string.Empty, user?.PasswordHash ?? _dummyHash.Value);
        var refusal = user is null ? RefusedUnknownUser
            : user.PasswordHash is null ? RefusedNoPassword
            : !matches ? RefusedWrongPassword
            : !user.IsActive ? RefusedDisabled
            : null;
        if (refusal is not null)
        {
            // A password that does not match proves nothing about who typed it, so the attempt is not put on the account holder's name.
            var entry = Subject(user).Did(AuditActions.SignInRefused, reason: refusal) with { IpAddress = ipAddress };
            await _audit.RecordAsync(AuditActor.UnknownUser, entry, cancellationToken);
            return null;
        }

        await _audit.SaveChangeAsync(_session, Actor(user!), async () =>
        {
            await _users.RecordSignInAsync(user!.Id, null, _timeProvider.GetUtcNow(), cancellationToken);
            return Subject(user).Did(AuditActions.SignedIn, reason: ByPassword) with { IpAddress = ipAddress };
        }, cancellationToken);
        return ToSignIn(user!);
    }

    public async Task<SsoSignInResult> SignInWithSsoAsync(SsoSignInRequest request, CancellationToken cancellationToken)
    {
        if (!request.EmailVerified || !EmailNormalizer.TryNormalize(request.Email, request.AllowedDomains, out var normalized, out _))
        {
            var entry = UnknownUser.Did(AuditActions.SignInRefused, reason: request.EmailVerified ? RefusedDomain : RefusedUnverified) with { IpAddress = request.IpAddress };
            await _audit.RecordAsync(AuditActor.UnknownUser, entry, cancellationToken);
            return new SsoSignInResult(SsoSignInOutcome.NotAllowed, null);
        }

        var name = string.IsNullOrWhiteSpace(request.DisplayName) ? null : request.DisplayName.Trim();
        var now = _timeProvider.GetUtcNow();
        var existing = await _users.GetByEmailAsync(normalized, cancellationToken);
        var user = existing ?? await CreateSsoUserAsync(NewSsoUser(normalized, name, now), request.IpAddress, cancellationToken);
        if (!user.IsActive)
        {
            await _audit.RecordAsync(Actor(user), Subject(user).Did(AuditActions.SignInRefused, reason: RefusedDisabled) with { IpAddress = request.IpAddress }, cancellationToken);
            return new SsoSignInResult(SsoSignInOutcome.Disabled, null);
        }

        await _audit.SaveChangeAsync(_session, Actor(user), async () =>
        {
            if (existing is not null)
            {
                await _users.RecordSignInAsync(user.Id, name, now, cancellationToken);
            }

            return Subject(user).Did(AuditActions.SignedIn, reason: BySso) with { IpAddress = request.IpAddress };
        }, cancellationToken);
        return new SsoSignInResult(SsoSignInOutcome.SignedIn, ToSignIn(user));
    }

    public Task SignOutAsync(AuditActor actor, string? ipAddress, CancellationToken cancellationToken)
    {
        var entry = new AuditSubject(AuditEntityTypes.PortalUser, actor.Id ?? AuditActor.UnknownUserName, actor.Name).Did(AuditActions.SignedOut) with { IpAddress = ipAddress };
        return _audit.RecordAsync(actor, entry, cancellationToken);
    }

    private static PortalUser NewSsoUser(string email, string? displayName, DateTimeOffset now) => new()
    {
        Email = email,
        DisplayName = displayName,
        Role = PortalRole.None,
        IsActive = true,
        LastSignInOn = now,
        CreatedOn = now,
        CreatedBy = SsoCreator
    };

    /// <summary>
    /// Creates a first-time single sign-on user with no access, and records it. Two first sign-ins at once: the unique email lets one insert win,
    /// and the other reads the row it made, so the creation is recorded once.
    /// </summary>
    private async Task<PortalUser> CreateSsoUserAsync(PortalUser created, string? ipAddress, CancellationToken cancellationToken)
    {
        long? id = null;
        await _session.InTransactionAsync(
            async () =>
            {
                id = await _users.TryInsertAsync(created, cancellationToken);
                if (id is { } newId)
                {
                    var entry = new AuditSubject(AuditEntityTypes.PortalUser, AuditValue.Id(newId), created.SignInName)
                        .Did(AuditActions.Created, AuditedFields.PortalUserAccess.Created(created), FirstSso) with
                    { IpAddress = ipAddress };
                    await _audit.RecordAsync(AuditActor.User(newId, created.SignInName), entry, cancellationToken);
                }

                return true;
            },
            cancellationToken);
        var user = id is { } inserted ? await _users.GetByIdAsync(inserted, cancellationToken) : await _users.GetByEmailAsync(created.Email!, cancellationToken);
        return user ?? throw new InvalidOperationException("The portal user could not be created or found.");
    }

    public async Task<PortalSignIn?> GetCurrentAsync(long userId, CancellationToken cancellationToken)
    {
        var user = await _users.GetByIdAsync(userId, cancellationToken);
        return user is { IsActive: true } ? ToSignIn(user) : null;
    }

    public async Task<AdminResult> ChangePasswordAsync(
        long userId, string? currentPassword, string? newPassword, string? confirmPassword, CancellationToken cancellationToken)
    {
        var user = await _users.GetByIdAsync(userId, cancellationToken);
        if (user is not { IsActive: true, PasswordHash: not null })
        {
            return AdminResult.Fail("This account signs in with single sign-on, so it has no password here.");
        }

        if (!_hasher.Verify(currentPassword ?? string.Empty, user.PasswordHash))
        {
            return AdminResult.Fail("The current password is wrong.");
        }

        var problem = CheckNewPassword(user, currentPassword!, newPassword, confirmPassword);
        if (problem is not null)
        {
            return AdminResult.Fail(problem);
        }

        await _audit.SaveChangeAsync(_session, Actor(user), async () =>
        {
            await _users.UpdatePasswordAsync(user.Id, _hasher.Hash(newPassword!), user.SignInName, _timeProvider.GetUtcNow(), cancellationToken);
            return Subject(user).Did(AuditActions.PasswordChanged, [new AuditChange(AuditedFields.Password, null, null, Hidden: true)]);
        }, cancellationToken);
        return AdminResult.Ok;
    }

    public async Task<IReadOnlyList<PortalUserDto>> ListAsync(CancellationToken cancellationToken)
    {
        var users = await _users.ListAsync(cancellationToken);
        return users.Select(u => new PortalUserDto(
            u.Id, u.SignInName, u.DisplayName, u.Username is not null, u.Role, u.IsActive, u.LastSignInOn, u.CreatedOn, u.ModifiedOn, u.ModifiedBy)).ToList();
    }

    public async Task<AdminResult> SetAccessAsync(long userId, string? role, bool isActive, long changedById, AuditActor actor, CancellationToken cancellationToken)
    {
        if (role is null || !PortalRole.All.Contains(role))
        {
            return AdminResult.Fail("Choose an access level.");
        }

        if (userId == changedById)
        {
            return AdminResult.Fail("You cannot change your own access. Ask another administrator.");
        }

        var user = await _users.GetByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return AdminResult.Fail("The user does not exist.");
        }

        var losesAdmin = user is { Role: PortalRole.Admin, IsActive: true } && (role != PortalRole.Admin || !isActive);
        if (losesAdmin && await _users.CountActiveAdminsAsync(cancellationToken) <= 1)
        {
            return AdminResult.Fail("This is the last active administrator. Make someone else an administrator first.");
        }

        var changes = AuditedFields.PortalUserAccess.Changed(user, new PortalUser { Id = user.Id, Role = role, IsActive = isActive });
        await _audit.SaveChangeAsync(_session, actor, async () =>
        {
            await _users.UpdateAccessAsync(userId, role, isActive, actor.Name, _timeProvider.GetUtcNow(), cancellationToken);
            return Subject(user).Did(AuditActions.AccessChanged, changes);
        }, cancellationToken);
        return AdminResult.Ok;
    }

    private static string? CheckNewPassword(PortalUser user, string currentPassword, string? newPassword, string? confirmPassword)
    {
        if (string.IsNullOrEmpty(newPassword) || newPassword.Length < MinPasswordLength || newPassword.Length > MaxPasswordLength)
        {
            return $"The new password must be {MinPasswordLength} to {MaxPasswordLength} characters.";
        }

        if (newPassword != confirmPassword)
        {
            return "The two new passwords are not the same.";
        }

        if (newPassword == currentPassword || string.Equals(newPassword, user.Username, StringComparison.OrdinalIgnoreCase))
        {
            return "Choose a password that is not the current one and not the username.";
        }

        return null;
    }

    private static AuditActor Actor(PortalUser user) => AuditActor.User(user.Id, user.SignInName);

    private static AuditSubject Subject(PortalUser? user) =>
        user is null ? UnknownUser : new AuditSubject(AuditEntityTypes.PortalUser, AuditValue.Id(user.Id), user.SignInName);

    private static PortalSignIn ToSignIn(PortalUser user) => new(user.Id, user.SignInName, user.Role, user.MustChangePassword);
}
