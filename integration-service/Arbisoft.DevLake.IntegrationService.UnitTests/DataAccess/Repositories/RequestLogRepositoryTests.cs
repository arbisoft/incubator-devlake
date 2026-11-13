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
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Arbisoft.DevLake.IntegrationService.UnitTests.TestHelpers;
using Microsoft.Extensions.DependencyInjection;
using MySqlConnector;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.DataAccess.Repositories;

[Collection(MySqlTestGroup.Name)]
public class RequestLogRepositoryTests : RepositoryTestBase
{
    private readonly MySqlDatabaseFixture _fixture;

    public RequestLogRepositoryTests(MySqlDatabaseFixture fixture)
        : base(fixture)
    {
        _fixture = fixture;
    }

    private IRequestLogRepository Repository => Get<IRequestLogRepository>();

    [MySqlFact]
    public async Task Insert_GetByCorrelationId_AndJsonBodyRoundTrip()
    {
        var client = await InsertClientAsync();
        var id = await InsertRequestLogAsync(client.Id);
        var log = (await Repository.GetByIdAsync(id, CancellationToken.None))!;
        await Repository.InsertJsonAsync(new RequestLogJson { RequestLogId = id, Json = "{\"email\":\"a@arbisoft.com\",\"timeFrame\":\"24h\"}" }, CancellationToken.None);

        var byCorrelation = await Repository.GetByCorrelationIdAsync(log.CorrelationId, CancellationToken.None);
        var json = await Repository.GetJsonAsync(id, CancellationToken.None);

        Assert.Equal(id, byCorrelation!.Id);
        Assert.Equal(RequestStatus.Received, byCorrelation.Status);
        Assert.Equal(36, byCorrelation.CorrelationId.Length);
        Assert.Contains("\"timeFrame\"", json, StringComparison.Ordinal);
        Assert.Null(await Repository.GetJsonAsync(long.MaxValue, CancellationToken.None));
    }

    [MySqlFact]
    public async Task Insert_DuplicateCorrelationId_IsRejected()
    {
        var client = await InsertClientAsync();
        var log = new RequestLog
        {
            ClientRefId = client.Id,
            CorrelationId = Guid.NewGuid().ToString("D"),
            Url = "/x",
            Status = RequestStatus.Received,
            EventType = "engineer-stats",
            CreatedOn = Instant
        };
        await Repository.InsertAsync(log, CancellationToken.None);

        var exception = await Assert.ThrowsAsync<MySqlException>(() => Repository.InsertAsync(log, CancellationToken.None));

        Assert.Equal(MySqlErrorCode.DuplicateKeyEntry, exception.ErrorCode);
    }

    [MySqlFact]
    public async Task UpdateStatus_AndListByStatusSince_ReturnOldestFirstWithinTheWindow()
    {
        var client = await InsertClientAsync();
        var since = Instant.AddDays(3650);
        var late = await InsertRequestLogAsync(client.Id, RequestStatus.Queued, since.AddMinutes(10));
        var early = await InsertRequestLogAsync(client.Id, RequestStatus.Queued, since.AddMinutes(1));
        await InsertRequestLogAsync(client.Id, RequestStatus.Queued, since.AddMinutes(-1));
        var received = await InsertRequestLogAsync(client.Id, RequestStatus.Received, since.AddMinutes(2));
        Assert.True(await Repository.UpdateStatusAsync(received, RequestStatus.Queued, CancellationToken.None));

        var queued = await Repository.ListByStatusSinceAsync(RequestStatus.Queued, since, 10, CancellationToken.None);
        var limited = await Repository.ListByStatusSinceAsync(RequestStatus.Queued, since, 2, CancellationToken.None);

        Assert.Equal([early, received, late], queued.Where(l => l.ClientRefId == client.Id).Select(l => l.Id));
        Assert.Equal(2, limited.Count);
    }

    [MySqlFact]
    public async Task TryChangeStatus_ChangesOnlyFromTheExpectedStatus()
    {
        var client = await InsertClientAsync();
        var id = await InsertRequestLogAsync(client.Id, RequestStatus.Received);

        Assert.True(await Repository.TryChangeStatusAsync(id, RequestStatus.Received, RequestStatus.Queued, CancellationToken.None));
        Assert.False(await Repository.TryChangeStatusAsync(id, RequestStatus.Received, RequestStatus.Failed, CancellationToken.None));

        Assert.Equal(RequestStatus.Queued, (await Repository.GetByIdAsync(id, CancellationToken.None))!.Status);
    }

    [MySqlFact]
    public async Task ListByStatusCreatedBetween_IncludesTheStartExcludesTheEnd_OldestFirst()
    {
        var client = await InsertClientAsync();
        var from = Instant.AddDays(5000);
        var before = from.AddMinutes(10);
        var atStart = await InsertRequestLogAsync(client.Id, RequestStatus.Received, from);
        var inside = await InsertRequestLogAsync(client.Id, RequestStatus.Received, from.AddMinutes(5));
        await InsertRequestLogAsync(client.Id, RequestStatus.Received, before);
        await InsertRequestLogAsync(client.Id, RequestStatus.Received, from.AddMinutes(-1));
        await InsertRequestLogAsync(client.Id, RequestStatus.Queued, from.AddMinutes(6));

        var found = await Repository.ListByStatusCreatedBetweenAsync(RequestStatus.Received, from, before, 10, CancellationToken.None);
        var limited = await Repository.ListByStatusCreatedBetweenAsync(RequestStatus.Received, from, before, 1, CancellationToken.None);

        Assert.Equal([atStart, inside], found.Select(l => l.Id));
        Assert.Equal([atStart], limited.Select(l => l.Id));
    }

    [MySqlFact]
    public async Task List_AppliesEachFilterIndependently()
    {
        var client = await InsertClientAsync();
        var other = await InsertClientAsync();
        var day = Instant.AddDays(7300);
        var wanted = await InsertRequestLogAsync(client.Id, RequestStatus.Failed, day);
        await InsertRequestLogAsync(client.Id, RequestStatus.Success, day);
        await InsertRequestLogAsync(other.Id, RequestStatus.Failed, day);
        await InsertRequestLogAsync(client.Id, RequestStatus.Failed, day.AddDays(2));

        var page = await Repository.ListAsync(new RequestLogFilter(client.Id, RequestStatus.Failed, day.AddHours(-1), day.AddDays(1)), 1, 10, CancellationToken.None);
        var all = await Repository.ListAsync(new RequestLogFilter(client.Id), 1, 10, CancellationToken.None);

        Assert.Equal(wanted, Assert.Single(page.Items).Id);
        Assert.Equal(1, page.TotalCount);
        Assert.True(all.TotalCount >= 3);
    }

    private static RequestLog WithKey(long clientRefId, string? key, string status = RequestStatus.Received) => new()
    {
        ClientRefId = clientRefId,
        CorrelationId = Guid.NewGuid().ToString("D"),
        Url = "/x",
        Status = status,
        EventType = "engineer-stats",
        CreatedOn = Instant,
        IdempotencyKey = key
    };

    [MySqlFact]
    public async Task TryInsert_AcceptsTheFirstRequestWithAKey_AndRefusesASecondWithoutThrowing()
    {
        var client = await InsertClientAsync();
        var key = Guid.NewGuid().ToString("N");

        var first = await Repository.TryInsertAsync(WithKey(client.Id, key), CancellationToken.None);
        var second = await Repository.TryInsertAsync(WithKey(client.Id, key), CancellationToken.None);

        Assert.NotNull(first);
        Assert.Null(second);
        Assert.Equal(first, (await Repository.GetByIdempotencyKeyAsync(key, CancellationToken.None))!.Id);
    }

    [MySqlFact]
    public async Task TryInsert_ManyRequestsWithoutAKey_NeverCollide()
    {
        var client = await InsertClientAsync();

        Assert.NotNull(await Repository.TryInsertAsync(WithKey(client.Id, null), CancellationToken.None));
        Assert.NotNull(await Repository.TryInsertAsync(WithKey(client.Id, null), CancellationToken.None));
        await Repository.InsertAsync(WithKey(client.Id, null, RequestStatus.RevokedNoCallbackUrl), CancellationToken.None);
    }

    [MySqlFact]
    public async Task TryInsert_ARacingPair_LetsExactlyOneWin()
    {
        var client = await InsertClientAsync();
        var key = Guid.NewGuid().ToString("N");

        var results = await Task.WhenAll(Enumerable.Range(0, 8).Select(async _ =>
        {
            await using var scope = NewScope();
            return await scope.ServiceProvider.GetRequiredService<IRequestLogRepository>().TryInsertAsync(WithKey(client.Id, key), CancellationToken.None);
        }));

        Assert.Single(results, id => id is not null);
        Assert.Equal(7, results.Count(id => id is null));
    }

    [MySqlFact]
    public async Task ReleaseIdempotencyKey_FreesTheKeyOfThatRowOnly_SoARepeatCanTakeIt()
    {
        var client = await InsertClientAsync();
        var key = Guid.NewGuid().ToString("N");
        var old = (await Repository.TryInsertAsync(WithKey(client.Id, key), CancellationToken.None))!.Value;

        await Repository.ReleaseIdempotencyKeyAsync(old, CancellationToken.None);
        var replacement = await Repository.TryInsertAsync(WithKey(client.Id, key), CancellationToken.None);
        await Repository.ReleaseIdempotencyKeyAsync(old, CancellationToken.None);

        Assert.NotNull(replacement);
        Assert.Null((await Repository.GetByIdAsync(old, CancellationToken.None))!.IdempotencyKey);
        Assert.Equal(replacement, (await Repository.GetByIdempotencyKeyAsync(key, CancellationToken.None))!.Id);
    }

    [MySqlFact]
    public async Task GetByIdempotencyKey_UnknownKey_ReturnsNull()
    {
        Assert.Null(await Repository.GetByIdempotencyKeyAsync(Guid.NewGuid().ToString("N"), CancellationToken.None));
    }

    [MySqlFact]
    public async Task ListStale_ReturnsOnlyTheGivenStatuses_OlderThanTheCutoff_OldestFirst_UpToTheLimit()
    {
        var client = await InsertClientAsync();
        var cutoff = Instant.AddYears(50);
        var oldest = await InsertRequestLogAsync(client.Id, RequestStatus.Queued, cutoff.AddHours(-3));
        var older = await InsertRequestLogAsync(client.Id, RequestStatus.Processing, cutoff.AddHours(-2));
        await InsertRequestLogAsync(client.Id, RequestStatus.Success, cutoff.AddHours(-4));
        await InsertRequestLogAsync(client.Id, RequestStatus.Failed, cutoff.AddHours(-4));
        await InsertRequestLogAsync(client.Id, RequestStatus.Queued, cutoff.AddHours(1));
        await InsertRequestLogAsync(client.Id, RequestStatus.Queued, cutoff);

        var stale = await Repository.ListStaleAsync([RequestStatus.Received, RequestStatus.Queued, RequestStatus.Processing], cutoff, cutoff, 10_000, CancellationToken.None);
        var limited = await Repository.ListStaleAsync([RequestStatus.Received, RequestStatus.Queued, RequestStatus.Processing], cutoff, cutoff, 1, CancellationToken.None);

        Assert.Equal([oldest, older], stale.Where(l => l.ClientRefId == client.Id).Select(l => l.Id));
        Assert.Equal(stale.OrderBy(l => l.CreatedOn).ThenBy(l => l.Id).Select(l => l.Id), stale.Select(l => l.Id));
        Assert.Single(limited);
        Assert.Equal(stale[0].Id, limited[0].Id);
    }

    [MySqlFact]
    public async Task ListStale_LeavesOutARequestAWorkerStillHolds()
    {
        var client = await InsertClientAsync();
        var cutoff = Instant.AddYears(51);
        var held = await InsertRequestLogAsync(client.Id, RequestStatus.Processing, cutoff.AddHours(-3));
        var leaseRanOut = await InsertRequestLogAsync(client.Id, RequestStatus.Processing, cutoff.AddHours(-3));
        Assert.True(await Repository.TryClaimAsync(held, cutoff, cutoff.AddMinutes(10), CancellationToken.None));
        Assert.True(await Repository.TryClaimAsync(leaseRanOut, cutoff.AddHours(-1), cutoff.AddMinutes(-1), CancellationToken.None));

        var stale = await Repository.ListStaleAsync([RequestStatus.Processing], cutoff, cutoff, 10_000, CancellationToken.None);

        Assert.Equal([leaseRanOut], stale.Where(l => l.ClientRefId == client.Id).Select(l => l.Id));
    }

    [MySqlFact]
    public async Task TryClaim_OnlyOneOfTwoWorkersWins_AndTheWinnerHoldsItUntilTheLeaseRunsOut()
    {
        var client = await InsertClientAsync();
        var id = await InsertRequestLogAsync(client.Id, RequestStatus.Queued);
        var now = Instant.AddYears(52);

        Assert.True(await Repository.TryClaimAsync(id, now, now.AddMinutes(10), CancellationToken.None));
        Assert.False(await Repository.TryClaimAsync(id, now.AddMinutes(1), now.AddMinutes(11), CancellationToken.None));

        var claimed = (await Repository.GetByIdAsync(id, CancellationToken.None))!;
        Assert.Equal(RequestStatus.Processing, claimed.Status);
        Assert.Equal(now.AddMinutes(10), claimed.ClaimedUntil);
        Assert.Null(claimed.NextAttemptOn);

        Assert.True(await Repository.TryClaimAsync(id, now.AddMinutes(10).AddTicks(10), now.AddMinutes(20), CancellationToken.None));
    }

    [MySqlFact]
    public async Task TryClaim_TwoWorkersAtTheSameMoment_ExactlyOneWins()
    {
        var client = await InsertClientAsync();
        var id = await InsertRequestLogAsync(client.Id, RequestStatus.Queued);
        var now = Instant.AddYears(53);

        var attempts = await Task.WhenAll(Enumerable.Range(0, 8).Select(async _ =>
        {
            await using var scope = _fixture.Services!.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<IRequestLogRepository>().TryClaimAsync(id, now, now.AddMinutes(10), CancellationToken.None);
        }));

        Assert.Single(attempts, won => won);
    }

    [MySqlFact]
    public async Task TryClaim_AFinishedRequest_CannotBeClaimed()
    {
        var client = await InsertClientAsync();
        foreach (var status in new[] { RequestStatus.Success, RequestStatus.Failed, RequestStatus.RevokedNoCallbackUrl })
        {
            var id = await InsertRequestLogAsync(client.Id, status);

            Assert.False(await Repository.TryClaimAsync(id, Instant, Instant.AddMinutes(10), CancellationToken.None));
        }
    }

    [MySqlFact]
    public async Task Defer_ReleasesTheLease_AndTheRequestIsClaimableOnlyOnceItIsDue()
    {
        var client = await InsertClientAsync();
        var id = await InsertRequestLogAsync(client.Id, RequestStatus.Queued);
        var now = Instant.AddYears(54);
        await Repository.TryClaimAsync(id, now, now.AddMinutes(10), CancellationToken.None);

        await Repository.DeferAsync(id, RequestStatus.Processing, now.AddMinutes(2), CancellationToken.None);

        var deferred = (await Repository.GetByIdAsync(id, CancellationToken.None))!;
        Assert.Equal(now.AddMinutes(2), deferred.NextAttemptOn);
        Assert.Null(deferred.ClaimedUntil);
        Assert.False(await Repository.TryClaimAsync(id, now.AddMinutes(1), now.AddMinutes(11), CancellationToken.None));
        Assert.True(await Repository.TryClaimAsync(id, now.AddMinutes(2), now.AddMinutes(12), CancellationToken.None));
    }

    [MySqlFact]
    public async Task UpdateStatus_ClearsTheLeaseAndTheDeferral()
    {
        var client = await InsertClientAsync();
        var id = await InsertRequestLogAsync(client.Id, RequestStatus.Queued);
        await Repository.DeferAsync(id, RequestStatus.Processing, Instant.AddMinutes(2), CancellationToken.None);

        await Repository.UpdateStatusAsync(id, RequestStatus.Success, CancellationToken.None);

        var finished = (await Repository.GetByIdAsync(id, CancellationToken.None))!;
        Assert.Null(finished.NextAttemptOn);
        Assert.Null(finished.ClaimedUntil);
    }

    [MySqlFact]
    public async Task ListDue_ListsDeferredRequestsThatAreDue_AndRequestsWhoseLeaseRanOut_ButNotNewQueuedOnesOrFinishedOnes()
    {
        var client = await InsertClientAsync();
        var now = Instant.AddYears(55);
        var since = now.AddHours(-2);
        var dueRetry = await InsertRequestLogAsync(client.Id, RequestStatus.Queued, now.AddMinutes(-30));
        await Repository.DeferAsync(dueRetry, RequestStatus.Processing, now.AddMinutes(-1), CancellationToken.None);
        var notYet = await InsertRequestLogAsync(client.Id, RequestStatus.Queued, now.AddMinutes(-30));
        await Repository.DeferAsync(notYet, RequestStatus.Processing, now.AddMinutes(5), CancellationToken.None);
        var crashed = await InsertRequestLogAsync(client.Id, RequestStatus.Queued, now.AddMinutes(-30));
        await Repository.TryClaimAsync(crashed, now.AddMinutes(-20), now.AddMinutes(-10), CancellationToken.None);
        var held = await InsertRequestLogAsync(client.Id, RequestStatus.Queued, now.AddMinutes(-30));
        await Repository.TryClaimAsync(held, now, now.AddMinutes(10), CancellationToken.None);
        var waitingForCredentials = await InsertRequestLogAsync(client.Id, RequestStatus.Queued, now.AddMinutes(-30));
        await Repository.DeferAsync(waitingForCredentials, RequestStatus.Queued, now.AddMinutes(-2), CancellationToken.None);
        await InsertRequestLogAsync(client.Id, RequestStatus.Queued, now.AddMinutes(-30));
        await InsertRequestLogAsync(client.Id, RequestStatus.Success, now.AddMinutes(-30));
        var tooOld = await InsertRequestLogAsync(client.Id, RequestStatus.Queued, since.AddMinutes(-1));
        await Repository.DeferAsync(tooOld, RequestStatus.Processing, now.AddMinutes(-1), CancellationToken.None);

        var due = await Repository.ListDueAsync(now, since, 100, CancellationToken.None);

        Assert.Equal(new[] { waitingForCredentials, dueRetry, crashed }.Order(), due.Where(l => l.ClientRefId == client.Id).Select(l => l.Id).Order());
    }

    [MySqlFact]
    public async Task Payload_IsStoredExactly_ReplacedOnASecondSave_AndDeleted()
    {
        var client = await InsertClientAsync();
        var id = await InsertRequestLogAsync(client.Id);
        const string first = "{\"b\": 1, \"a\":  [\"x\"]}";

        await Repository.SavePayloadAsync(id, first, Instant, CancellationToken.None);
        Assert.Equal(first, await Repository.GetPayloadAsync(id, CancellationToken.None));

        await Repository.SavePayloadAsync(id, "{}", Instant, CancellationToken.None);
        Assert.Equal("{}", await Repository.GetPayloadAsync(id, CancellationToken.None));

        await Repository.DeletePayloadAsync(id, CancellationToken.None);
        Assert.Null(await Repository.GetPayloadAsync(id, CancellationToken.None));
    }

    [MySqlFact]
    public async Task Attempts_AreRecordedInOrder_WithTheErrorOfAFailedAttempt()
    {
        var client = await InsertClientAsync();
        var id = await InsertRequestLogAsync(client.Id);
        await Repository.InsertAttemptAsync(new RequestResponseAttempt
        {
            RequestLogId = id,
            ResponseJson = "{\"error\":\"boom\"}",
            AttemptStatus = "Failed",
            FailureError = "HTTP 500",
            AttemptBy = "RequestProcessor",
            AttemptOn = Instant
        }, CancellationToken.None);
        await Repository.InsertAttemptAsync(new RequestResponseAttempt
        {
            RequestLogId = id,
            ResponseJson = "{}",
            AttemptStatus = "Success",
            AttemptBy = "RequestProcessor",
            AttemptOn = Instant.AddSeconds(30)
        }, CancellationToken.None);

        var attempts = await Repository.GetAttemptsAsync(id, CancellationToken.None);

        Assert.Equal(["Failed", "Success"], attempts.Select(a => a.AttemptStatus));
        Assert.Equal("HTTP 500", attempts[0].FailureError);
        Assert.Null(attempts[1].FailureError);
    }
}
