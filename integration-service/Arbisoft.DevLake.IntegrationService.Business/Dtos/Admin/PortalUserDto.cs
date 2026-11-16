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


namespace Arbisoft.DevLake.IntegrationService.Business.Dtos.Admin;

/// <summary>A portal user as the Users page shows it. Never the password hash.</summary>
public sealed record PortalUserDto(
    long Id,
    string SignInName,
    string? DisplayName,
    bool IsLocal,
    string Role,
    bool IsActive,
    DateTimeOffset? LastSignInOn,
    DateTimeOffset CreatedOn,
    DateTimeOffset? ModifiedOn,
    string? ModifiedBy);

/// <summary>Who is signed in and what they may do, as the portal's sign-in cookie carries it.</summary>
public sealed record PortalSignIn(long UserId, string Name, string Role, bool MustChangePassword);

/// <summary>How a single sign-on attempt ended.</summary>
public enum SsoSignInOutcome
{
    /// <summary>Signed in; the user may still have no access yet.</summary>
    SignedIn,

    /// <summary>The account is not an allowed (Arbisoft) email.</summary>
    NotAllowed,

    /// <summary>An administrator disabled the account.</summary>
    Disabled
}

public sealed record SsoSignInResult(SsoSignInOutcome Outcome, PortalSignIn? SignIn);
