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

using System.Diagnostics;
using Arbisoft.DevLake.IntegrationService.Business.Services.Audit;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.Business.Audit;

public class AuditTrailTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 16, 12, 0, 0, TimeSpan.Zero);

    private readonly IAuditLogRepository _repository = Substitute.For<IAuditLogRepository>();
    private readonly AuditTrail _trail;
    private AuditLog? _written;

    public AuditTrailTests()
    {
        _repository.InsertAsync(Arg.Do<AuditLog>(log => _written = log), Arg.Any<CancellationToken>()).Returns(1L);
        _trail = new AuditTrail(_repository, new FakeTimeProvider(Now));
    }

    [Fact]
    public async Task Record_WritesWhoDidWhatToWhichObject_AndWhen()
    {
        var entry = new AuditEntry(
            AuditActions.Updated, AuditEntityTypes.Client, "7", "Sophia", [new AuditChange("Name", "Sophia", "Sophia AI")], "Renamed", "10.0.0.1");

        await _trail.RecordAsync(AuditActor.User(3, "alice@arbisoft.com"), entry, CancellationToken.None);

        Assert.NotNull(_written);
        Assert.Equal(Now, _written.OccurredOn);
        Assert.Equal((AuditActorKind.User, "3", "alice@arbisoft.com"), (_written.ActorKind, _written.ActorId, _written.ActorName));
        Assert.Equal((AuditActions.Updated, AuditEntityTypes.Client, "7", "Sophia"), (_written.Action, _written.EntityType, _written.EntityId, _written.EntityLabel));
        Assert.Equal(("Renamed", "10.0.0.1"), (_written.Reason, _written.IpAddress));
        Assert.Equal([new AuditChange("Name", "Sophia", "Sophia AI")], AuditTrail.ReadChanges(_written.Changes));
    }

    [Fact]
    public async Task Record_TheServiceItself_HasNoActorId()
    {
        await _trail.RecordAsync(AuditActor.System, new AuditEntry(AuditActions.StatusChanged, AuditEntityTypes.Request, "9"), CancellationToken.None);

        Assert.Equal((AuditActorKind.System, (string?)null, AuditActor.SystemName), (_written!.ActorKind, _written.ActorId, _written.ActorName));
        Assert.Null(_written.Changes);
    }

    [Fact]
    public async Task Record_AHiddenChange_NeverStoresAValue_EvenIfOneWasGiven()
    {
        var entry = new AuditEntry(AuditActions.Updated, AuditEntityTypes.UpstreamToken, "DevLake", Changes: [new AuditChange("Token", "old-token", "new-token", Hidden: true)]);

        await _trail.RecordAsync(AuditActor.User(1, "admin"), entry, CancellationToken.None);

        Assert.DoesNotContain("old-token", _written!.Changes, StringComparison.Ordinal);
        Assert.DoesNotContain("new-token", _written.Changes, StringComparison.Ordinal);
        Assert.Equal([new AuditChange("Token", null, null, Hidden: true)], AuditTrail.ReadChanges(_written.Changes));
    }

    [Fact]
    public async Task Record_CutsValuesAndTextThatWouldNotFitTheirColumns()
    {
        var entry = new AuditEntry(
            AuditActions.Updated, AuditEntityTypes.Scope, "1", new string('l', 400), [new AuditChange("Description", null, new string('d', 5000))], new string('r', 900));

        await _trail.RecordAsync(AuditActor.User(1, "admin"), entry, CancellationToken.None);

        Assert.Equal(255, _written!.EntityLabel!.Length);
        Assert.Equal(500, _written.Reason!.Length);
        Assert.EndsWith("…", _written.Reason, StringComparison.Ordinal);
        Assert.Equal(AuditTrail.MaxValueLength, AuditTrail.ReadChanges(_written.Changes).Single().New!.Length);
    }

    [Fact]
    public async Task Record_CarriesTheCurrentTraceId_SoAnEntryCanBeMatchedToItsRequestLogs()
    {
        using var activity = new Activity("test").SetIdFormat(ActivityIdFormat.W3C).Start();

        await _trail.RecordAsync(AuditActor.Client("sophia"), new AuditEntry(AuditActions.TokenIssued, AuditEntityTypes.AccessToken, "jti"), CancellationToken.None);

        Assert.Equal(activity.TraceId.ToHexString(), _written!.TraceId);
        Assert.Equal((AuditActorKind.Client, "sophia", "sophia"), (_written.ActorKind, _written.ActorId, _written.ActorName));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not json")]
    [InlineData("{\"field\":\"x\"}")]
    public void ReadChanges_NothingReadable_GivesNoChanges(string? json)
    {
        Assert.Empty(AuditTrail.ReadChanges(json));
    }
}
