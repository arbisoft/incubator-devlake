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

using System.Text.Json;
using Arbisoft.DevLake.IntegrationService.Business.Dtos.Stats;
using Arbisoft.DevLake.IntegrationService.Business.Services.Processing;
using Arbisoft.DevLake.IntegrationService.Business.Services.Requests;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis.DevLake;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis.Sophia;
using Arbisoft.DevLake.IntegrationService.DataAccess.Messaging;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.Business.Processing;

public class RequestWorkerTests
{
    private const string TimeFrameJson = "{\"correlation_id\":\"c1\",\"event_type\":\"engineer-stats\",\"emails\":[\"jane@arbisoft.com\"],\"time_frame\":\"24h\",\"requested_on\":\"2026-11-11T12:00:00+00:00\"}";
    private const string StoredPayload = "{\"correlation_id\":\"c1\",\"engineers\":[]}";

    private static readonly DateTimeOffset Now = new(2026, 11, 13, 12, 0, 0, TimeSpan.Zero);

    private readonly IRequestLogRepository _logs = Substitute.For<IRequestLogRepository>();
    private readonly IEmailMappingRepository _mappings = Substitute.For<IEmailMappingRepository>();
    private readonly ICallbackAvailability _callbacks = Substitute.For<ICallbackAvailability>();
    private readonly ISophiaClient _sophia = Substitute.For<ISophiaClient>();
    private readonly IEngineerStatsCollector _collector = Substitute.For<IEngineerStatsCollector>();
    private readonly ICallbackDelivery _delivery = Substitute.For<ICallbackDelivery>();
    private readonly IRequestAttemptLog _attempts = Substitute.For<IRequestAttemptLog>();
    private readonly FakeTimeProvider _time = new(Now);
    private readonly ProcessingRun _run;
    private readonly RequestWorker _worker;

    public RequestWorkerTests()
    {
        GivenLog(RequestStatus.Queued);
        GivenBody(TimeFrameJson);
        GivenStoredPayload(null);
        _logs.TryClaimAsync(41, Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>()).Returns(true);
        _callbacks.IsAvailableAsync(7, "engineer-stats", Arg.Any<CancellationToken>()).Returns(true);
        _mappings.GetMappedEmailsAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns([]);
        _collector.CollectAsync(Arg.Any<string>(), Arg.Any<IReadOnlyList<string>>(), Arg.Any<StatsQuery>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(call => Task.FromResult(Stats(call.ArgAt<string>(0))));
        GivenDelivery(new DeliveryAttempt(DeliveryOutcome.Delivered));
        var options = Options.Create(new ProcessingOptions { DeliveryRetryDelaySeconds = 30, MaxDeliveryRetryDelaySeconds = 900, UnavailableRetryDelaySeconds = 60, ClaimLeaseSeconds = 600 });
        _run = new ProcessingRun(Now.AddMinutes(2), _time);
        _worker = new RequestWorker(_logs, _mappings, _callbacks, _sophia, _collector, _delivery, _attempts, options, _time, NullLogger<RequestWorker>.Instance);
    }

    private static EmployeeStatsDto Stats(string email)
    {
        var data = new Dictionary<string, JsonElement> { [email] = JsonDocument.Parse("{\"n\":1}").RootElement.Clone() };
        return new EmployeeStatsDto(email, ["alt@gmail.com"], data, data, data, data, []);
    }

    private static QueueDelivery Delivery(string? rejection = null, string correlationId = "c1") =>
        new(new QueueMessage(correlationId, "engineer-stats", "{}"), 5, false, 0, rejection);

    private static RequestLog Log(string status) => new() { Id = 41, ClientRefId = 7, CorrelationId = "c1", Status = status, EventType = "engineer-stats" };

    private void GivenLog(string status) => _logs.GetByCorrelationIdAsync("c1", Arg.Any<CancellationToken>()).Returns(Log(status));

    private void GivenBody(string? json) => _logs.GetJsonAsync(41, Arg.Any<CancellationToken>()).Returns(json);

    private void GivenStoredPayload(string? payload) => _logs.GetPayloadAsync(41, Arg.Any<CancellationToken>()).Returns(payload);

    private void GivenDelivery(DeliveryAttempt attempt) => _delivery.AttemptAsync(Arg.Any<RequestLog>(), Arg.Any<string>()).Returns(attempt);

    private void DevLakeFails(Exception exception) =>
        _collector.CollectAsync(Arg.Any<string>(), Arg.Any<IReadOnlyList<string>>(), Arg.Any<StatsQuery>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromException<EmployeeStatsDto>(exception));

    private Task<WorkResult> HandleAsync(CancellationToken stopping = default) => _worker.HandleMessageAsync(Delivery(), _run, stopping);

    [Fact]
    public async Task ANewRequest_IsClaimed_Collected_Stored_Delivered_AndFinished_WhichAcknowledgesItsMessage()
    {
        var result = await HandleAsync();

        Assert.Equal(new WorkResult(MessageOutcome.Ack, StepResult.Finished), result);
        Received.InOrder(() =>
        {
            _logs.TryClaimAsync(41, Now, Now.AddSeconds(600), Arg.Any<CancellationToken>());
            _sophia.EnsureAccessTokenAsync(7, "c1", Arg.Any<CancellationToken>());
            _collector.CollectAsync("jane@arbisoft.com", Arg.Any<IReadOnlyList<string>>(), Arg.Any<StatsQuery>(), "c1", Arg.Any<CancellationToken>());
            _logs.SavePayloadAsync(41, Arg.Any<string>(), Now, Arg.Any<CancellationToken>());
            _delivery.AttemptAsync(Arg.Any<RequestLog>(), Arg.Any<string>());
            _logs.UpdateStatusAsync(41, RequestStatus.Success, Arg.Any<CancellationToken>());
            _logs.DeletePayloadAsync(41, Arg.Any<CancellationToken>());
        });
    }

    [Fact]
    public async Task ThePayload_HasTheAgreedShape_ForATimeFrame_AndTheSameBodyIsStoredAndSent()
    {
        string? stored = null;
        string? sent = null;
        await _logs.SavePayloadAsync(41, Arg.Do<string>(p => stored = p), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>());
        await _delivery.AttemptAsync(Arg.Any<RequestLog>(), Arg.Do<string>(p => sent = p));

        await HandleAsync();

        Assert.Equal(stored, sent);
        var root = JsonDocument.Parse(sent!).RootElement;
        Assert.Equal("c1", root.GetProperty("correlation_id").GetString());
        Assert.Equal("24h", root.GetProperty("time_frame").GetString());
        Assert.Equal("2026-11-10T12:00:00Z", root.GetProperty("from").GetString());
        Assert.Equal("2026-11-11T12:00:00Z", root.GetProperty("to").GetString());
        var engineer = Assert.Single(root.GetProperty("engineers").EnumerateArray());
        Assert.Equal("jane@arbisoft.com", engineer.GetProperty("email").GetString());
        Assert.Equal("alt@gmail.com", Assert.Single(engineer.GetProperty("mapped_emails").EnumerateArray()).GetString());
        foreach (var source in new[] { "jira", "github", "ai_usage", "ai_cost" })
        {
            Assert.Equal(1, engineer.GetProperty(source).GetProperty("jane@arbisoft.com").GetProperty("n").GetInt32());
        }

        Assert.Equal(JsonValueKind.Array, engineer.GetProperty("errors").ValueKind);
        Assert.Equal(0, engineer.GetProperty("errors").GetArrayLength());
    }

    [Fact]
    public async Task ThePayload_ForARangeBatch_HasFromAndToAndOneEntryPerEngineer()
    {
        GivenBody("{\"correlation_id\":\"c1\",\"event_type\":\"engineer-stats\",\"emails\":[\"a@arbisoft.com\",\"b@arbisoft.com\"],\"requested_on\":\"2026-11-11T12:00:00+00:00\",\"from\":\"2026-11-01T00:00:00Z\",\"to\":\"2026-11-08T00:00:00Z\"}");
        string? sent = null;
        await _delivery.AttemptAsync(Arg.Any<RequestLog>(), Arg.Do<string>(p => sent = p));

        await HandleAsync();

        var root = JsonDocument.Parse(sent!).RootElement;
        Assert.Equal("2026-11-01T00:00:00Z", root.GetProperty("from").GetString());
        Assert.Equal("2026-11-08T00:00:00Z", root.GetProperty("to").GetString());
        Assert.False(root.TryGetProperty("time_frame", out _));
        Assert.Equal(["a@arbisoft.com", "b@arbisoft.com"], root.GetProperty("engineers").EnumerateArray().Select(e => e.GetProperty("email").GetString()));
    }

    [Fact]
    public async Task EachEngineersMappedEmails_AreLoadedOneAtATime_BeforeAnythingRunsInParallel()
    {
        const string json = "{\"correlation_id\":\"c1\",\"event_type\":\"engineer-stats\",\"emails\":[\"a@arbisoft.com\",\"b@arbisoft.com\",\"c@arbisoft.com\"],\"time_frame\":\"24h\",\"requested_on\":\"2026-11-11T12:00:00+00:00\"}";
        var inFlight = 0;
        var peak = 0;
        var lookupsFinishedBeforeCollection = true;
        var lookups = 0;
        _mappings.GetMappedEmailsAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(async _ =>
        {
            var now = Interlocked.Increment(ref inFlight);
            peak = Math.Max(peak, now);
            await Task.Delay(30);
            Interlocked.Decrement(ref inFlight);
            Interlocked.Increment(ref lookups);
            return (IReadOnlyList<string>)["alt@gmail.com"];
        });
        _collector.CollectAsync(Arg.Any<string>(), Arg.Any<IReadOnlyList<string>>(), Arg.Any<StatsQuery>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(call =>
            {
                lookupsFinishedBeforeCollection &= Volatile.Read(ref lookups) == 3;
                return Task.FromResult(Stats(call.ArgAt<string>(0)));
            });

        GivenBody(json);

        await _worker.HandleMessageAsync(Delivery(), _run, CancellationToken.None);

        Assert.Equal(1, peak);
        Assert.True(lookupsFinishedBeforeCollection);
        await _collector.Received(3).CollectAsync(Arg.Any<string>(), Arg.Is<IReadOnlyList<string>>(mapped => mapped.SequenceEqual(new[] { "alt@gmail.com" })), Arg.Any<StatsQuery>(), "c1", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task AStoredPayload_IsSentAsItIs_WithoutAskingDevLakeOrSophiasTokenEndpointAgain()
    {
        GivenStoredPayload(StoredPayload);

        await HandleAsync();

        await _delivery.Received(1).AttemptAsync(Arg.Any<RequestLog>(), StoredPayload);
        await _collector.DidNotReceiveWithAnyArgs().CollectAsync(default!, default!, default!, default!, default);
        await _sophia.DidNotReceiveWithAnyArgs().EnsureAccessTokenAsync(default, default!, default);
        await _logs.DidNotReceiveWithAnyArgs().SavePayloadAsync(default, default!, default, default);
    }

    [Fact]
    public async Task AMessageWithNoLogRow_IsDeadLettered_BecauseTheApiAlwaysCommitsTheRowBeforePublishing()
    {
        _logs.GetByCorrelationIdAsync("c1", Arg.Any<CancellationToken>()).Returns((RequestLog?)null);

        Assert.Equal(WorkResult.DeadLettered, await HandleAsync());

        await _logs.DidNotReceiveWithAnyArgs().TryClaimAsync(default, default, default, default);
    }

    [Fact]
    public async Task AMessageTheConsumerRejected_IsDeadLettered_AndItsRequestEndsFailedWithTheReason()
    {
        var result = await _worker.HandleMessageAsync(Delivery("The message was delivered 6 times, over the limit of 5."), _run, CancellationToken.None);

        Assert.Equal(WorkResult.DeadLettered, result);
        await _attempts.Received(1).RecordAsync(41, DeliveryAttemptStatus.FetchFailed, "{}", "The message was delivered 6 times, over the limit of 5.", Arg.Any<CancellationToken>());
        await _logs.Received(1).UpdateStatusAsync(41, RequestStatus.Failed, Arg.Any<CancellationToken>());
        await _logs.DidNotReceiveWithAnyArgs().TryClaimAsync(default, default, default, default);
    }

    [Fact]
    public async Task ARejectedMessageWithoutACorrelationId_IsDeadLettered_WithNothingToUpdate()
    {
        var result = await _worker.HandleMessageAsync(Delivery("no correlation ID", correlationId: string.Empty), _run, CancellationToken.None);

        Assert.Equal(WorkResult.DeadLettered, result);
        await _logs.DidNotReceiveWithAnyArgs().GetByCorrelationIdAsync(default!, default);
    }

    [Theory]
    [InlineData(RequestStatus.Success)]
    [InlineData(RequestStatus.Failed)]
    [InlineData(RequestStatus.RevokedNoCallbackUrl)]
    public async Task ARepeatMessageForAFinishedRequest_IsAcknowledged_WithoutTouchingTheRequest(string status)
    {
        GivenLog(status);

        Assert.Equal(WorkResult.Acknowledged, await HandleAsync());

        await _logs.DidNotReceiveWithAnyArgs().TryClaimAsync(default, default, default, default);
        await _delivery.DidNotReceiveWithAnyArgs().AttemptAsync(default!, default!);
    }

    /// <summary>A second copy of a message (a relay republish, or a redelivery) while the request is being worked on or waiting in the database.</summary>
    [Fact]
    public async Task AMessageForARequestTheJobAlreadyOwns_IsAcknowledged_WithoutDoingTheWorkTwice()
    {
        _logs.TryClaimAsync(41, Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>()).Returns(false);

        Assert.Equal(WorkResult.Acknowledged, await HandleAsync());

        await _collector.DidNotReceiveWithAnyArgs().CollectAsync(default!, default!, default!, default!, default);
        await _delivery.DidNotReceiveWithAnyArgs().AttemptAsync(default!, default!);
    }

    [Fact]
    public async Task AnUnreadableStoredBody_FailsTheRequest_WithTheReasonRecorded()
    {
        GivenBody("{ not json");

        var result = await HandleAsync();

        Assert.Equal(new WorkResult(MessageOutcome.Ack, StepResult.Finished), result);
        await _attempts.Received(1).RecordAsync(41, DeliveryAttemptStatus.FetchFailed, "{}", Arg.Is<string?>(reason => reason != null && reason.Contains("not valid JSON")), Arg.Any<CancellationToken>());
        await _logs.Received(1).UpdateStatusAsync(41, RequestStatus.Failed, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ACallbackRemovedWhileTheRequestWaited_RevokesIt_BeforeDevLakeIsCalled()
    {
        _callbacks.IsAvailableAsync(7, "engineer-stats", Arg.Any<CancellationToken>()).Returns(false);

        await HandleAsync();

        await _logs.Received(1).UpdateStatusAsync(41, RequestStatus.RevokedNoCallbackUrl, Arg.Any<CancellationToken>());
        await _collector.DidNotReceiveWithAnyArgs().CollectAsync(default!, default!, default!, default!, default);
    }

    [Theory]
    [InlineData(typeof(ExternalApiRejectedException))]
    [InlineData(typeof(ExternalApiResponseException))]
    public async Task WhenDevLakeRefusesTheRequest_ItFails_OnItsOwn_WithTheReasonRecorded(Type failure)
    {
        DevLakeFails(CreateFailure(failure));

        var result = await HandleAsync();

        Assert.Equal(StepResult.Finished, result.Step);
        Assert.Null(_run.HaltReason);
        await _attempts.Received(1).RecordAsync(41, DeliveryAttemptStatus.FetchFailed, "{}", Arg.Is<string?>(reason => reason != null && reason.Contains("DevLake")), Arg.Any<CancellationToken>());
        await _logs.Received(1).UpdateStatusAsync(41, RequestStatus.Failed, Arg.Any<CancellationToken>());
        await _delivery.DidNotReceiveWithAnyArgs().AttemptAsync(default!, default!);
    }

    [Theory]
    [InlineData(typeof(ExternalAuthenticationException))]
    [InlineData(typeof(ExternalApiUnavailableException))]
    public async Task WhenDevLakeCannotBeUsedRightNow_TheRequestWaitsAsQueued_AndTheRunStopsTakingWork(Type failure)
    {
        DevLakeFails(CreateFailure(failure));

        var result = await HandleAsync();

        Assert.Equal(new WorkResult(MessageOutcome.Ack, StepResult.Deferred), result);
        Assert.Contains("DevLake", _run.HaltReason, StringComparison.Ordinal);
        Assert.False(_run.MayTakeWork);
        await _logs.Received(1).DeferAsync(41, RequestStatus.Queued, Now.AddSeconds(60), Arg.Any<CancellationToken>());
        await _attempts.DidNotReceiveWithAnyArgs().RecordAsync(default, default!, default!, default, default);
    }

    [Fact]
    public async Task OnceDevLakeFailedInThisRun_ARequestStillToCollect_WaitsWithoutCallingIt()
    {
        _run.Halt("DevLake failed during the run");

        await HandleAsync();

        await _logs.Received(1).DeferAsync(41, RequestStatus.Queued, Now.AddSeconds(60), Arg.Any<CancellationToken>());
        await _collector.DidNotReceiveWithAnyArgs().CollectAsync(default!, default!, default!, default!, default);
    }

    [Fact]
    public async Task WhenTheClientsCredentialsAreRefused_OnlyThatClientWaits_AndDevLakeIsNotCalled()
    {
        _sophia.EnsureAccessTokenAsync(7, "c1", Arg.Any<CancellationToken>())
            .Returns(Task.FromException(new ExternalAuthenticationException("Sophia", "Sophia refused to issue an access token (401).", 401)));

        var result = await HandleAsync();

        Assert.Equal(StepResult.Deferred, result.Step);
        Assert.True(_run.IsClientFailing(7));
        Assert.Null(_run.HaltReason);
        await _logs.Received(1).DeferAsync(41, RequestStatus.Queued, Now.AddSeconds(60), Arg.Any<CancellationToken>());
        await _collector.DidNotReceiveWithAnyArgs().CollectAsync(default!, default!, default!, default!, default);
    }

    [Fact]
    public async Task AClientWithNoUsableOutboundConfig_IsRevoked_WhenItsTokenIsChecked()
    {
        _sophia.EnsureAccessTokenAsync(7, "c1", Arg.Any<CancellationToken>()).Returns(Task.FromException(new CallbackNotConfiguredException("no config")));

        await HandleAsync();

        await _logs.Received(1).UpdateStatusAsync(41, RequestStatus.RevokedNoCallbackUrl, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task AClientAlreadyFailingInThisRun_HasItsOtherRequestsWait_WithoutCallingSophiaOrDevLakeAgain()
    {
        _run.MarkClientFailing(7);
        GivenStoredPayload(StoredPayload);

        await HandleAsync();

        await _logs.Received(1).DeferAsync(41, RequestStatus.Processing, Now.AddSeconds(60), Arg.Any<CancellationToken>());
        await _sophia.DidNotReceiveWithAnyArgs().EnsureAccessTokenAsync(default, default!, default);
        await _delivery.DidNotReceiveWithAnyArgs().AttemptAsync(default!, default!);
    }

    [Theory]
    [InlineData(1, 30)]
    [InlineData(2, 60)]
    [InlineData(3, 120)]
    [InlineData(6, 900)]
    [InlineData(9, 900)]
    public async Task AFailedDelivery_IsDeferredByTheBackoff_CappedAtTheLongestWait(int failedAttempts, int delaySeconds)
    {
        GivenDelivery(new DeliveryAttempt(DeliveryOutcome.Failed, failedAttempts, AttemptsUsedUp: false));

        var result = await HandleAsync();

        Assert.Equal(StepResult.Deferred, result.Step);
        await _logs.Received(1).DeferAsync(41, RequestStatus.Processing, Now.AddSeconds(delaySeconds), Arg.Any<CancellationToken>());
        await _logs.DidNotReceiveWithAnyArgs().DeletePayloadAsync(default, default);
    }

    [Theory]
    [InlineData(1, 200, 200)]
    [InlineData(3, 10, 120)]
    [InlineData(1, 5000, 900)]
    public async Task TheCallbacksRetryAfter_IsHonouredWhenLongerThanTheBackoff_UpToTheLongestWait(int failedAttempts, int retryAfterSeconds, int delaySeconds)
    {
        GivenDelivery(new DeliveryAttempt(DeliveryOutcome.Failed, failedAttempts, AttemptsUsedUp: false, TimeSpan.FromSeconds(retryAfterSeconds)));

        await HandleAsync();

        await _logs.Received(1).DeferAsync(41, RequestStatus.Processing, Now.AddSeconds(delaySeconds), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ADeliveryTheCallbackRejected_FailsTheRequestAtOnce_WithoutRetrying()
    {
        GivenDelivery(new DeliveryAttempt(DeliveryOutcome.Rejected, 1));

        Assert.Equal(StepResult.Finished, (await HandleAsync()).Step);

        await _logs.Received(1).UpdateStatusAsync(41, RequestStatus.Failed, Arg.Any<CancellationToken>());
        await _logs.Received(1).DeletePayloadAsync(41, Arg.Any<CancellationToken>());
        await _logs.DidNotReceiveWithAnyArgs().DeferAsync(default, default!, default, default);
    }

    [Fact]
    public async Task TheLastAllowedFailedDelivery_FailsTheRequest_AndDropsTheStoredPayload()
    {
        GivenDelivery(new DeliveryAttempt(DeliveryOutcome.Failed, 3, AttemptsUsedUp: true));

        Assert.Equal(StepResult.Finished, (await HandleAsync()).Step);

        await _logs.Received(1).UpdateStatusAsync(41, RequestStatus.Failed, Arg.Any<CancellationToken>());
        await _logs.Received(1).DeletePayloadAsync(41, Arg.Any<CancellationToken>());
        await _logs.DidNotReceiveWithAnyArgs().DeferAsync(default, default!, default, default);
    }

    [Fact]
    public async Task CredentialsRefusedByTheCallback_MarkTheClientFailing_AndTheRequestWaitsWithItsPayload()
    {
        GivenDelivery(new DeliveryAttempt(DeliveryOutcome.CredentialsRefused));

        await HandleAsync();

        Assert.True(_run.IsClientFailing(7));
        await _logs.Received(1).DeferAsync(41, RequestStatus.Processing, Now.AddSeconds(60), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ACallbackRemovedDuringDelivery_RevokesTheRequest()
    {
        GivenDelivery(new DeliveryAttempt(DeliveryOutcome.Revoked));

        await HandleAsync();

        await _logs.Received(1).UpdateStatusAsync(41, RequestStatus.RevokedNoCallbackUrl, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task AShutdownWhileCollecting_HandsTheRequestBackDueAtOnce()
    {
        using var stopping = new CancellationTokenSource();
        _collector.CollectAsync(Arg.Any<string>(), Arg.Any<IReadOnlyList<string>>(), Arg.Any<StatsQuery>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(async call =>
            {
                await stopping.CancelAsync();
                call.ArgAt<CancellationToken>(4).ThrowIfCancellationRequested();
                return Stats("x");
            });

        var result = await HandleAsync(stopping.Token);

        Assert.Equal(new WorkResult(MessageOutcome.Ack, StepResult.Deferred), result);
        await _logs.Received(1).DeferAsync(41, RequestStatus.Queued, Now, Arg.Any<CancellationToken>());
        await _delivery.DidNotReceiveWithAnyArgs().AttemptAsync(default!, default!);
    }

    [Fact]
    public async Task ADueRequest_IsClaimedAndWorkedTheSameWay()
    {
        GivenStoredPayload(StoredPayload);

        var step = await _worker.HandleDueAsync(Log(RequestStatus.Processing), _run, CancellationToken.None);

        Assert.Equal(StepResult.Finished, step);
        await _logs.Received(1).TryClaimAsync(41, Now, Now.AddSeconds(600), Arg.Any<CancellationToken>());
        await _logs.Received(1).UpdateStatusAsync(41, RequestStatus.Success, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ADueRequestAnotherWorkerTookFirst_IsSkipped()
    {
        _logs.TryClaimAsync(41, Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>()).Returns(false);

        Assert.Equal(StepResult.Skipped, await _worker.HandleDueAsync(Log(RequestStatus.Processing), _run, CancellationToken.None));

        await _logs.DidNotReceiveWithAnyArgs().GetJsonAsync(default, default);
    }

    private static Exception CreateFailure(Type type) => type.Name switch
    {
        nameof(ExternalApiRejectedException) => new ExternalApiRejectedException("DevLake", "DevLake rejected the request (404).", 404),
        nameof(ExternalApiResponseException) => new ExternalApiResponseException("DevLake", "DevLake answered with something that is not JSON."),
        nameof(ExternalAuthenticationException) => new ExternalAuthenticationException("DevLake", "DevLake rejected our credentials (401).", 401),
        _ => new ExternalApiUnavailableException("DevLake", "DevLake was unavailable (503).", 503)
    };
}
