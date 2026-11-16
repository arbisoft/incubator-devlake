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


namespace Arbisoft.DevLake.IntegrationService.DataAccess.Models;

/// <summary>Someone who uses the admin portal: the local administrator (username and password hash) or an Arbisoft account (email).</summary>
public sealed class PortalUser
{
    public long Id { get; init; }

    /// <summary>The sign-in name of a local account; null for a single sign-on account.</summary>
    public string? Username { get; init; }

    /// <summary>The PBKDF2 hash of a local account's password; null for a single sign-on account.</summary>
    public string? PasswordHash { get; init; }

    /// <summary>True until the account's password, such as the seeded default, has been changed. The portal allows nothing else until it is.</summary>
    public bool MustChangePassword { get; init; }

    /// <summary>The normalized email of a single sign-on account; null for a local account.</summary>
    public string? Email { get; init; }

    public string? DisplayName { get; init; }

    /// <summary>One of <see cref="PortalRole"/>.</summary>
    public string Role { get; init; } = PortalRole.None;

    public bool IsActive { get; init; }
    public DateTimeOffset? LastSignInOn { get; init; }
    public DateTimeOffset CreatedOn { get; init; }
    public string CreatedBy { get; init; } = string.Empty;
    public DateTimeOffset? ModifiedOn { get; init; }
    public string? ModifiedBy { get; init; }

    /// <summary>The name shown and recorded as createdBy or modifiedBy: the username, or the email.</summary>
    public string SignInName => Username ?? Email ?? string.Empty;
}

/// <summary>What a portal user may do. A new single sign-on user starts with <see cref="None"/>.</summary>
public static class PortalRole
{
    /// <summary>Signed in, but sees nothing until an administrator grants access.</summary>
    public const string None = "None";

    /// <summary>Sees all data and makes changes.</summary>
    public const string Editor = "Editor";

    /// <summary>Everything an editor does, plus managing portal users and their access.</summary>
    public const string Admin = "Admin";

    public static IReadOnlyList<string> All { get; } = [None, Editor, Admin];
}
