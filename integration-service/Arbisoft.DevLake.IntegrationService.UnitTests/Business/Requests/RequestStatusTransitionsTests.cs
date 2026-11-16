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

using Arbisoft.DevLake.IntegrationService.Business.Services.Audit;
using Arbisoft.DevLake.IntegrationService.Business.Services.Requests;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Persistence;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Arbisoft.DevLake.IntegrationService.UnitTests.TestHelpers;
using NSubstitute;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.Business.Requests;

public class RequestStatusTransitionsTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 16, 12, 0, 0, TimeSpan.Zero);
    private static readonly RequestKey Request = new(5, "corr-5");

    private readonly IRequestLogRepository _logs = Substitute.For<IRequestLogRepository>();
    private readonly IDbSession _session = Substitute.For<IDbSession>();
    private readonly RecordingAuditTrail _audit = new();
    private readonly RequestStatusTransitions _transitions;

    public RequestStatusTransitionsTests()
    {
        _transitions = new RequestStatusTransitions(_logs, _audit, _session);
    }

    private void GivenStatus(string status) => _logs.GetStatusForUpdateAsync(5, Arg.Any<CancellationToken>()).Returns(status);

    [Fact]
    public async Task Set_RecordsTheChange_AsTheService_FromTheStatusTheLockedRowHad()
    {
        GivenStatus(RequestStatus.Processing);

        await _transitions.SetAsync(Request, new StatusChange(RequestStatus.Failed, StatusReasons.AttemptsUsedUp), CancellationToken.None);

        var (actor, entry) = Assert.Single(_audit.Recorded);
        Assert.Equal(AuditActor.System, actor);
        Assert.Equal((AuditActions.StatusChanged, AuditEntityTypes.Request, "5", "corr-5", StatusReasons.AttemptsUsedUp), (entry.Action, entry.EntityType, entry.EntityId, entry.EntityLabel, entry.Reason));
        Assert.Equal([new AuditChange(AuditedFields.Status, RequestStatus.Processing, RequestStatus.Failed)], entry.Changes!);
        Received.InOrder(() =>
        {
            _session.BeginTransactionAsync(Arg.Any<CancellationToken>());
            _logs.GetStatusForUpdateAsync(5, Arg.Any<CancellationToken>());
            _logs.UpdateStatusAsync(5, RequestStatus.Failed, Arg.Any<CancellationToken>());
            _session.CommitAsync(Arg.Any<CancellationToken>());
        });
    }

    [Fact]
    public async Task Defer_ThatKeepsTheStatus_IsSaved_ButNotRecorded()
    {
        GivenStatus(RequestStatus.Processing);

        await _transitions.DeferAsync(Request, new StatusChange(RequestStatus.Processing, StatusReasons.RetryingDelivery), Now.AddMinutes(1), CancellationToken.None);

        Assert.Empty(_audit.Recorded);
        await _logs.Received(1).DeferAsync(5, RequestStatus.Processing, Now.AddMinutes(1), Arg.Any<CancellationToken>());
        await _session.Received(1).CommitAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task TryChange_RecordsTheExpectedStatusAsWhereItCameFrom()
    {
        _logs.TryChangeStatusAsync(5, RequestStatus.Received, RequestStatus.Queued, Arg.Any<CancellationToken>()).Returns(true);

        Assert.True(await _transitions.TryChangeAsync(Request, RequestStatus.Received, new StatusChange(RequestStatus.Queued, StatusReasons.Published), CancellationToken.None));

        Assert.Equal([new AuditChange(AuditedFields.Status, RequestStatus.Received, RequestStatus.Queued)], _audit.OnlyEntry.Changes!);
    }

    [Fact]
    public async Task TryChange_ThatLosesTheRace_RecordsNothing_AndRollsBack()
    {
        Assert.False(await _transitions.TryChangeAsync(Request, RequestStatus.Received, new StatusChange(RequestStatus.Queued, StatusReasons.Published), CancellationToken.None));

        Assert.Empty(_audit.Recorded);
        await _session.Received(1).RollbackAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task TryClaim_AQueuedRequest_RecordsItMovingToProcessing()
    {
        GivenStatus(RequestStatus.Queued);
        _logs.TryClaimAsync(5, Now, Now.AddMinutes(5), Arg.Any<CancellationToken>()).Returns(true);

        Assert.True(await _transitions.TryClaimAsync(Request, Now, Now.AddMinutes(5), CancellationToken.None));

        Assert.Equal((RequestStatus.Queued, RequestStatus.Processing), (_audit.OnlyEntry.Changes![0].Old, _audit.OnlyEntry.Changes[0].New));
        Assert.Equal(StatusReasons.Claimed, _audit.OnlyEntry.Reason);
    }

    [Fact]
    public async Task TryClaim_ARequestAlreadyProcessing_IsClaimed_WithoutAnEntry()
    {
        GivenStatus(RequestStatus.Processing);
        _logs.TryClaimAsync(5, Now, Now.AddMinutes(5), Arg.Any<CancellationToken>()).Returns(true);

        Assert.True(await _transitions.TryClaimAsync(Request, Now, Now.AddMinutes(5), CancellationToken.None));

        Assert.Empty(_audit.Recorded);
    }

    [Fact]
    public async Task TryClaim_HeldByAnotherWorker_RecordsNothing()
    {
        GivenStatus(RequestStatus.Queued);

        Assert.False(await _transitions.TryClaimAsync(Request, Now, Now.AddMinutes(5), CancellationToken.None));

        Assert.Empty(_audit.Recorded);
        await _session.Received(1).RollbackAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task RecordCreated_IsRecordedAsTheClientThatSentTheRequest()
    {
        await _transitions.RecordCreatedAsync(Request, RequestStatus.Received, "sophia", CancellationToken.None);

        var (actor, entry) = Assert.Single(_audit.Recorded);
        Assert.Equal((AuditActorKind.Client, "sophia"), (actor.Kind, actor.Id));
        Assert.Equal([new AuditChange(AuditedFields.Status, null, RequestStatus.Received)], entry.Changes!);
    }
}
