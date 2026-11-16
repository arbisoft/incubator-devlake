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

namespace Arbisoft.DevLake.IntegrationService.DataAccess.Persistence;

public static class DbSessionExtensions
{
    /// <summary>
    /// Runs <paramref name="work"/> in a transaction. It commits when the work returns true and rolls back when it returns false or throws, so a
    /// change and the audit entry that describes it are always saved or undone together.
    /// </summary>
    public static async Task<bool> InTransactionAsync(this IDbSession session, Func<Task<bool>> work, CancellationToken cancellationToken)
    {
        await session.BeginTransactionAsync(cancellationToken);
        try
        {
            if (await work())
            {
                await session.CommitAsync(cancellationToken);
                return true;
            }

            await session.RollbackAsync(cancellationToken);
            return false;
        }
        catch
        {
            await session.RollbackAsync(cancellationToken);
            throw;
        }
    }
}
