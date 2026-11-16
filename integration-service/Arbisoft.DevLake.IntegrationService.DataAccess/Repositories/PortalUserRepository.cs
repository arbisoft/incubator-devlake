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
using Arbisoft.DevLake.IntegrationService.DataAccess.Options;
using Arbisoft.DevLake.IntegrationService.DataAccess.Persistence;
using Microsoft.Extensions.Options;
using MySqlConnector;

namespace Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;

public sealed class PortalUserRepository : RepositoryBase, IPortalUserRepository
{
    private const string Columns =
        "id, username, passwordHash, mustChangePassword, email, displayName, role, isActive, lastSignInOn, createdOn, createdBy, modifiedOn, modifiedBy";

    private const int MaxUsers = 1000;

    public PortalUserRepository(IDbSession session, IOptions<DatabaseOptions> options)
        : base(session, options)
    {
    }

    public Task<PortalUser?> GetByIdAsync(long id, CancellationToken cancellationToken)
    {
        return QuerySingleOrDefaultAsync<PortalUser>($"SELECT {Columns} FROM PortalUsers WHERE id = @id", new { id }, cancellationToken);
    }

    public Task<PortalUser?> GetByUsernameAsync(string username, CancellationToken cancellationToken)
    {
        return QuerySingleOrDefaultAsync<PortalUser>($"SELECT {Columns} FROM PortalUsers WHERE username = @username", new { username }, cancellationToken);
    }

    public Task<PortalUser?> GetByEmailAsync(string email, CancellationToken cancellationToken)
    {
        return QuerySingleOrDefaultAsync<PortalUser>($"SELECT {Columns} FROM PortalUsers WHERE email = @email", new { email }, cancellationToken);
    }

    public Task<IReadOnlyList<PortalUser>> ListAsync(CancellationToken cancellationToken)
    {
        return QueryAsync<PortalUser>(
            $"SELECT {Columns} FROM PortalUsers " +
            "ORDER BY FIELD(role, '" + PortalRole.Admin + "', '" + PortalRole.Editor + "', '" + PortalRole.None + "'), COALESCE(displayName, username, email), id LIMIT @limit",
            new { limit = MaxUsers },
            cancellationToken);
    }

    public async Task<long?> TryInsertAsync(PortalUser user, CancellationToken cancellationToken)
    {
        try
        {
            return await InsertAsync(
                "INSERT INTO PortalUsers (username, passwordHash, mustChangePassword, email, displayName, role, isActive, lastSignInOn, createdOn, createdBy) " +
                "VALUES (@Username, @PasswordHash, @MustChangePassword, @Email, @DisplayName, @Role, @IsActive, @LastSignInOn, @CreatedOn, @CreatedBy)",
                user,
                cancellationToken);
        }
        catch (MySqlException exception) when (exception.ErrorCode == MySqlErrorCode.DuplicateKeyEntry)
        {
            return null;
        }
    }

    public async Task<bool> UpdateAccessAsync(long id, string role, bool isActive, string modifiedBy, DateTimeOffset modifiedOn, CancellationToken cancellationToken)
    {
        var changed = await ExecuteAsync(
            "UPDATE PortalUsers SET role = @role, isActive = @isActive, modifiedBy = @modifiedBy, modifiedOn = @modifiedOn WHERE id = @id",
            new { id, role, isActive, modifiedBy, modifiedOn },
            cancellationToken);
        return changed > 0;
    }

    public async Task<bool> UpdatePasswordAsync(long id, string passwordHash, string modifiedBy, DateTimeOffset modifiedOn, CancellationToken cancellationToken)
    {
        var changed = await ExecuteAsync(
            "UPDATE PortalUsers SET passwordHash = @passwordHash, mustChangePassword = 0, modifiedBy = @modifiedBy, modifiedOn = @modifiedOn " +
            "WHERE id = @id AND username IS NOT NULL",
            new { id, passwordHash, modifiedBy, modifiedOn },
            cancellationToken);
        return changed > 0;
    }

    public async Task RecordSignInAsync(long id, string? displayName, DateTimeOffset signedInOn, CancellationToken cancellationToken)
    {
        await ExecuteAsync(
            "UPDATE PortalUsers SET lastSignInOn = @signedInOn, displayName = COALESCE(@displayName, displayName) WHERE id = @id",
            new { id, displayName, signedInOn },
            cancellationToken);
    }

    public Task<int> CountActiveAdminsAsync(CancellationToken cancellationToken)
    {
        return QuerySingleOrDefaultAsync<int>(
            "SELECT COUNT(*) FROM PortalUsers WHERE role = '" + PortalRole.Admin + "' AND isActive = 1", null, cancellationToken);
    }
}
