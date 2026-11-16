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

using Arbisoft.DevLake.IntegrationService.DataAccess.Persistence;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Audit;

public static class AuditTrailExtensions
{
    /// <summary>
    /// Makes a change and records it in one transaction. <paramref name="change"/> makes the change and returns the entry that describes it, or
    /// null when it changed nothing, such as a revoke that lost a race: then the transaction is rolled back and nothing is recorded. Returns whether
    /// the change was saved.
    /// </summary>
    public static Task<bool> SaveChangeAsync(
        this IAuditTrail audit, IDbSession session, AuditActor actor, Func<Task<AuditEntry?>> change, CancellationToken cancellationToken)
    {
        return session.InTransactionAsync(
            async () =>
            {
                var entry = await change();
                if (entry is null)
                {
                    return false;
                }

                await audit.RecordAsync(actor, entry, cancellationToken);
                return true;
            },
            cancellationToken);
    }
}
