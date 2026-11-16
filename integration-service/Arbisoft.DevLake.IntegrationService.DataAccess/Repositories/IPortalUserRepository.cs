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


using Arbisoft.DevLake.IntegrationService.DataAccess.Models;

namespace Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;

public interface IPortalUserRepository
{
    Task<PortalUser?> GetByIdAsync(long id, CancellationToken cancellationToken);

    Task<PortalUser?> GetByUsernameAsync(string username, CancellationToken cancellationToken);

    /// <summary>The single sign-on account with this normalized email, or null.</summary>
    Task<PortalUser?> GetByEmailAsync(string email, CancellationToken cancellationToken);

    /// <summary>Every portal user: administrators first, then editors, then those without access, each by name.</summary>
    Task<IReadOnlyList<PortalUser>> ListAsync(CancellationToken cancellationToken);

    /// <summary>Inserts a single sign-on account. Returns null when another account already has the email (two first sign-ins at once).</summary>
    Task<long?> TryInsertAsync(PortalUser user, CancellationToken cancellationToken);

    /// <summary>Sets what the user may do, and whether the account can sign in at all.</summary>
    Task<bool> UpdateAccessAsync(long id, string role, bool isActive, string modifiedBy, DateTimeOffset modifiedOn, CancellationToken cancellationToken);

    /// <summary>Replaces a local account's password hash and clears <see cref="PortalUser.MustChangePassword"/>.</summary>
    Task<bool> UpdatePasswordAsync(long id, string passwordHash, string modifiedBy, DateTimeOffset modifiedOn, CancellationToken cancellationToken);

    /// <summary>Records a sign-in, and the name the identity provider gave this time.</summary>
    Task RecordSignInAsync(long id, string? displayName, DateTimeOffset signedInOn, CancellationToken cancellationToken);

    /// <summary>How many active accounts are administrators.</summary>
    Task<int> CountActiveAdminsAsync(CancellationToken cancellationToken);
}
