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
using Arbisoft.DevLake.IntegrationService.Business.Services.Requests;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Admin;

public interface IPortalUserService
{
    /// <summary>Signs in a local account (the seeded administrator) with its username and password. Null when either is wrong or the account is disabled.</summary>
    Task<PortalSignIn?> SignInLocalAsync(string? username, string? password, CancellationToken cancellationToken);

    /// <summary>
    /// Signs in an Arbisoft account the identity provider vouched for. Its first sign-in creates it with no access, so the person sees a message to
    /// ask an administrator; only an email in <paramref name="allowedDomains"/> is accepted.
    /// </summary>
    Task<SsoSignInResult> SignInWithSsoAsync(string? email, string? displayName, IEnumerable<string> allowedDomains, CancellationToken cancellationToken);

    /// <summary>The signed-in user as the database has them now, or null when the account was removed or disabled. Read on every request.</summary>
    Task<PortalSignIn?> GetCurrentAsync(long userId, CancellationToken cancellationToken);

    /// <summary>Changes a local account's password, after checking the current one.</summary>
    Task<AdminResult> ChangePasswordAsync(long userId, string? currentPassword, string? newPassword, string? confirmPassword, CancellationToken cancellationToken);

    Task<IReadOnlyList<PortalUserDto>> ListAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Grants or removes access: the role, and whether the account can sign in at all. Nobody changes their own access, and the last active
    /// administrator cannot be demoted or disabled, so the portal can never be left without one.
    /// </summary>
    Task<AdminResult> SetAccessAsync(long userId, string? role, bool isActive, long changedById, string changedBy, CancellationToken cancellationToken);
}

public sealed class PortalUserService : IPortalUserService
{
    public const int MinPasswordLength = 8;
    public const int MaxPasswordLength = 256;

    private const string SsoCreator = "sso";
    private const string DummyPassword = "unused-password-for-timing";

    private readonly IPortalUserRepository _users;
    private readonly IClientSecretHasher _hasher;
    private readonly TimeProvider _timeProvider;
    private readonly Lazy<string> _dummyHash;

    public PortalUserService(IPortalUserRepository users, IClientSecretHasher hasher, TimeProvider timeProvider)
    {
        _users = users;
        _hasher = hasher;
        _timeProvider = timeProvider;
        _dummyHash = new Lazy<string>(() => hasher.Hash(DummyPassword));
    }

    public async Task<PortalSignIn?> SignInLocalAsync(string? username, string? password, CancellationToken cancellationToken)
    {
        var user = string.IsNullOrWhiteSpace(username) ? null : await _users.GetByUsernameAsync(username.Trim(), cancellationToken);

        // The hash is checked even for an unknown username, so the response time does not reveal which part was wrong.
        var matches = _hasher.Verify(password ?? string.Empty, user?.PasswordHash ?? _dummyHash.Value);
        if (user is null || user.PasswordHash is null || !matches || !user.IsActive)
        {
            return null;
        }

        await _users.RecordSignInAsync(user.Id, null, _timeProvider.GetUtcNow(), cancellationToken);
        return ToSignIn(user);
    }

    public async Task<SsoSignInResult> SignInWithSsoAsync(string? email, string? displayName, IEnumerable<string> allowedDomains, CancellationToken cancellationToken)
    {
        if (!EmailNormalizer.TryNormalize(email, allowedDomains, out var normalized, out _))
        {
            return new SsoSignInResult(SsoSignInOutcome.NotAllowed, null);
        }

        var name = string.IsNullOrWhiteSpace(displayName) ? null : displayName.Trim();
        var now = _timeProvider.GetUtcNow();
        var user = await _users.GetByEmailAsync(normalized, cancellationToken);
        if (user is null)
        {
            var created = new PortalUser
            {
                Email = normalized,
                DisplayName = name,
                Role = PortalRole.None,
                IsActive = true,
                LastSignInOn = now,
                CreatedOn = now,
                CreatedBy = SsoCreator
            };

            // Two first sign-ins at once: the unique email lets one insert win, and the other reads the row it made.
            var id = await _users.TryInsertAsync(created, cancellationToken);
            user = id is { } newId ? await _users.GetByIdAsync(newId, cancellationToken) : await _users.GetByEmailAsync(normalized, cancellationToken);
            if (user is null)
            {
                throw new InvalidOperationException("The portal user could not be created or found.");
            }
        }
        else
        {
            await _users.RecordSignInAsync(user.Id, name, now, cancellationToken);
        }

        return user.IsActive
            ? new SsoSignInResult(SsoSignInOutcome.SignedIn, ToSignIn(user))
            : new SsoSignInResult(SsoSignInOutcome.Disabled, null);
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

        await _users.UpdatePasswordAsync(user.Id, _hasher.Hash(newPassword!), user.SignInName, _timeProvider.GetUtcNow(), cancellationToken);
        return AdminResult.Ok;
    }

    public async Task<IReadOnlyList<PortalUserDto>> ListAsync(CancellationToken cancellationToken)
    {
        var users = await _users.ListAsync(cancellationToken);
        return users.Select(u => new PortalUserDto(
            u.Id, u.SignInName, u.DisplayName, u.Username is not null, u.Role, u.IsActive, u.LastSignInOn, u.CreatedOn, u.ModifiedOn, u.ModifiedBy)).ToList();
    }

    public async Task<AdminResult> SetAccessAsync(long userId, string? role, bool isActive, long changedById, string changedBy, CancellationToken cancellationToken)
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

        await _users.UpdateAccessAsync(userId, role, isActive, changedBy, _timeProvider.GetUtcNow(), cancellationToken);
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

    private static PortalSignIn ToSignIn(PortalUser user) => new(user.Id, user.SignInName, user.Role, user.MustChangePassword);
}
