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
using Arbisoft.DevLake.IntegrationService.DataAccess.Persistence;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Arbisoft.DevLake.IntegrationService.UnitTests.TestHelpers;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.DataAccess.Repositories;

[Collection(MySqlTestGroup.Name)]
public class AuditLogRepositoryTests : RepositoryTestBase
{
    public AuditLogRepositoryTests(MySqlDatabaseFixture fixture)
        : base(fixture)
    {
    }

    private IAuditLogRepository Repository => Get<IAuditLogRepository>();

    private static AuditLog Entry(string entityId, DateTimeOffset occurredOn, string actorKind = AuditActorKind.User, string action = "Updated") => new()
    {
        OccurredOn = occurredOn,
        ActorKind = actorKind,
        ActorId = actorKind == AuditActorKind.System ? null : "3",
        ActorName = "alice@arbisoft.com",
        Action = action,
        EntityType = "Client",
        EntityId = entityId,
        EntityLabel = "Sophia",
        Changes = "[{\"field\":\"name\",\"old\":\"a\",\"new\":\"b\"}]",
        Reason = "because",
        IpAddress = "2001:db8::1",
        TraceId = "4bf92f3577b34da6a3ce929d0e0e4736"
    };

    [MySqlFact]
    public async Task Insert_ThenList_ReadsBackEveryColumn()
    {
        var entityId = Unique("client");
        var id = await Repository.InsertAsync(Entry(entityId, Instant), CancellationToken.None);

        var page = await Repository.ListAsync(new AuditLogFilter(EntityType: "Client", EntityId: entityId), 1, 10, CancellationToken.None);

        var read = Assert.Single(page.Items);
        Assert.Equal(id, read.Id);
        Assert.Equal(Instant, read.OccurredOn);
        Assert.Equal((AuditActorKind.User, "3", "alice@arbisoft.com"), (read.ActorKind, read.ActorId, read.ActorName));
        Assert.Equal(("Updated", "Client", entityId, "Sophia"), (read.Action, read.EntityType, read.EntityId, read.EntityLabel));
        Assert.Equal(("because", "2001:db8::1", "4bf92f3577b34da6a3ce929d0e0e4736"), (read.Reason, read.IpAddress, read.TraceId));
        Assert.Contains("\"old\": \"a\"", read.Changes, StringComparison.Ordinal);
    }

    [MySqlFact]
    public async Task List_AnObjectsHistory_IsNewestFirst_AndPaged()
    {
        var entityId = Unique("client");
        for (var minute = 0; minute < 3; minute++)
        {
            await Repository.InsertAsync(Entry(entityId, Instant.AddMinutes(minute)), CancellationToken.None);
        }

        var first = await Repository.ListAsync(new AuditLogFilter(EntityType: "Client", EntityId: entityId), 1, 2, CancellationToken.None);
        var second = await Repository.ListAsync(new AuditLogFilter(EntityType: "Client", EntityId: entityId), 2, 2, CancellationToken.None);

        Assert.Equal(3, first.TotalCount);
        Assert.Equal([Instant.AddMinutes(2), Instant.AddMinutes(1)], first.Items.Select(item => item.OccurredOn));
        Assert.Equal([Instant], second.Items.Select(item => item.OccurredOn));
    }

    [MySqlFact]
    public async Task List_FiltersByWhoDidItWhatTheyDidAndWhen()
    {
        var entityId = Unique("client");
        await Repository.InsertAsync(Entry(entityId, Instant, AuditActorKind.User, "Updated"), CancellationToken.None);
        await Repository.InsertAsync(Entry(entityId, Instant.AddDays(1), AuditActorKind.System, "StatusChanged"), CancellationToken.None);
        await Repository.InsertAsync(Entry(entityId, Instant.AddDays(2), AuditActorKind.User, "Revoked"), CancellationToken.None);

        async Task<IEnumerable<string>> Actions(AuditLogFilter filter) =>
            (await Repository.ListAsync(filter with { EntityId = entityId }, 1, 10, CancellationToken.None)).Items.Select(item => item.Action);

        Assert.Equal(["Revoked", "Updated"], await Actions(new AuditLogFilter(ActorKind: AuditActorKind.User)));
        Assert.Equal(["StatusChanged"], await Actions(new AuditLogFilter(ActorKind: AuditActorKind.System)));
        Assert.Equal(["Revoked"], await Actions(new AuditLogFilter(Action: "Revoked", ActorId: "3")));
        Assert.Equal(["StatusChanged"], await Actions(new AuditLogFilter(From: Instant.AddDays(1), To: Instant.AddDays(2))));
    }

    [MySqlFact]
    public async Task Insert_RolledBackWithItsChange_LeavesNoEntry()
    {
        var entityId = Unique("client");
        var session = Get<IDbSession>();

        await session.BeginTransactionAsync(CancellationToken.None);
        await Repository.InsertAsync(Entry(entityId, Instant), CancellationToken.None);
        await session.RollbackAsync(CancellationToken.None);

        var page = await Repository.ListAsync(new AuditLogFilter(EntityId: entityId), 1, 10, CancellationToken.None);
        Assert.Equal(0, page.TotalCount);
    }
}
