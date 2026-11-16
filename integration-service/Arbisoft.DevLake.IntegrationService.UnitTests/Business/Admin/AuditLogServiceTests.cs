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
using Arbisoft.DevLake.IntegrationService.Business.Services.Admin;
using Arbisoft.DevLake.IntegrationService.Business.Services.Audit;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using NSubstitute;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.Business.Admin;

public class AuditLogServiceTests
{
    private readonly IAuditLogRepository _repository = Substitute.For<IAuditLogRepository>();
    private readonly AuditLogService _service;
    private AuditLogFilter? _filter;

    public AuditLogServiceTests()
    {
        _repository.ListAsync(Arg.Do<AuditLogFilter>(filter => _filter = filter), Arg.Any<int>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(new PagedResult<AuditLog>([], 0, 1, AuditLogService.PageSize));
        _service = new AuditLogService(_repository);
    }

    [Fact]
    public async Task List_PassesKnownFilters_AndTurnsTheDaysIntoAUtcRange_WithTheLastDayIncluded()
    {
        await _service.ListAsync(
            new AuditLogQuery(AuditActorKind.User, AuditEntityTypes.Client, " 7 ", AuditActions.Updated, new DateOnly(2026, 11, 1), new DateOnly(2026, 11, 2)),
            1,
            CancellationToken.None);

        Assert.Equal(
            new AuditLogFilter(
                AuditActorKind.User, null, AuditEntityTypes.Client, "7", AuditActions.Updated,
                new DateTimeOffset(2026, 11, 1, 0, 0, 0, TimeSpan.Zero), new DateTimeOffset(2026, 11, 3, 0, 0, 0, TimeSpan.Zero)),
            _filter);
    }

    [Fact]
    public async Task List_IgnoresValuesItDoesNotKnow_InsteadOfFilteringEverythingOut()
    {
        await _service.ListAsync(new AuditLogQuery("Robot", "Spaceship", "  ", "Dance"), 0, CancellationToken.None);

        Assert.Equal(new AuditLogFilter(), _filter);
        await _repository.Received(1).ListAsync(Arg.Any<AuditLogFilter>(), 1, AuditLogService.PageSize, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task List_ReadsEachEntrysChangesBack()
    {
        _repository.ListAsync(Arg.Any<AuditLogFilter>(), Arg.Any<int>(), Arg.Any<int>(), Arg.Any<CancellationToken>()).Returns(new PagedResult<AuditLog>(
            [new AuditLog { Id = 3, Action = AuditActions.Updated, Changes = "[{\"field\":\"Name\",\"old\":\"a\",\"new\":\"b\"},{\"field\":\"Token\",\"hidden\":true}]" }],
            1, 1, AuditLogService.PageSize));

        var page = await _service.ListAsync(new AuditLogQuery(), 1, CancellationToken.None);

        Assert.Equal([new AuditChange("Name", "a", "b"), new AuditChange("Token", null, null, Hidden: true)], Assert.Single(page.Items).Changes);
    }

    [Fact]
    public void EveryActionAndObjectType_IsOffered()
    {
        static IEnumerable<string> Constants(Type type) =>
            type.GetFields().Where(field => field.IsLiteral).Select(field => (string)field.GetRawConstantValue()!);

        Assert.Equal(Constants(typeof(AuditActions)).Order(), AuditLogService.Actions.Order());
        Assert.Equal(Constants(typeof(AuditEntityTypes)).Order(), AuditLogService.EntityTypes.Order());
    }
}
