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

using Arbisoft.DevLake.IntegrationService.Business.Services.Processing;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis.Sophia;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.Business.Processing;

public class CallbackDeliveryTests
{
    private const string Payload = "{\"correlation_id\":\"c1\"}";

    private static readonly RequestLog Request = new() { Id = 41, ClientRefId = 7, CorrelationId = "c1", EventType = "engineer-stats", Status = RequestStatus.Processing };

    private readonly ISophiaClient _sophia = Substitute.For<ISophiaClient>();
    private readonly IClientConfigRepository _configs = Substitute.For<IClientConfigRepository>();
    private readonly IRequestAttemptLog _attempts = Substitute.For<IRequestAttemptLog>();
    private readonly CallbackDelivery _delivery;

    public CallbackDeliveryTests()
    {
        GivenConfig(maxAttempts: 3);
        GivenFailedBefore(0);
        _delivery = new CallbackDelivery(_sophia, _configs, _attempts, NullLogger<CallbackDelivery>.Instance);
    }

    private void GivenConfig(int maxAttempts, bool active = true)
    {
        _configs.GetByClientRefIdAsync(7, Arg.Any<CancellationToken>()).Returns(new ClientConfig { Id = 3, ClientRefId = 7, MaxAttempts = maxAttempts, IsActive = active });
    }

    private void GivenFailedBefore(int attempts) => _attempts.CountDeliveryAttemptsAsync(41, Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>()).Returns(attempts);

    private void SophiaAnswers(SophiaDeliveryResult result) =>
        _sophia.PostCallbackAsync(7, "engineer-stats", Payload, "c1", Arg.Any<CancellationToken>()).Returns(result);

    private void SophiaThrows(Exception exception) =>
        _sophia.PostCallbackAsync(7, "engineer-stats", Payload, "c1", Arg.Any<CancellationToken>()).Returns(Task.FromException<SophiaDeliveryResult>(exception));

    [Fact]
    public async Task AnAcceptedPost_IsDelivered_AndRecordedWithSophiasAnswer()
    {
        SophiaAnswers(new SophiaDeliveryResult(true, 200, "{\"ok\":true}"));

        var attempt = await _delivery.AttemptAsync(Request, Payload);

        Assert.Equal(DeliveryOutcome.Delivered, attempt.Outcome);
        await _attempts.Received(1).RecordAsync(41, DeliveryAttemptStatus.Delivered, "{\"ok\":true}", null, Arg.Any<CancellationToken>(), Payload);
    }

    [Fact]
    public async Task ARefusedPost_IsOneFailedAttempt_RecordedWithTheStatus_AndNeverWaitedOn()
    {
        GivenFailedBefore(1);
        SophiaAnswers(new SophiaDeliveryResult(false, 500, "{\"error\":\"x\"}"));

        var attempt = await _delivery.AttemptAsync(Request, Payload);

        Assert.Equal(new DeliveryAttempt(DeliveryOutcome.Failed, 2, AttemptsUsedUp: false), attempt);
        await _sophia.Received(1).PostCallbackAsync(7, "engineer-stats", Payload, "c1", Arg.Any<CancellationToken>());
        await _attempts.Received(1).RecordAsync(41, DeliveryAttemptStatus.DeliveryFailed, "{\"error\":\"x\"}", "HTTP 500", Arg.Any<CancellationToken>(), Payload);
    }

    [Theory]
    [InlineData(408)]
    [InlineData(429)]
    [InlineData(500)]
    [InlineData(502)]
    [InlineData(503)]
    [InlineData(504)]
    public async Task ATimeoutTooManyRequestsOrServerError_IsWorthRetrying(int status)
    {
        SophiaAnswers(new SophiaDeliveryResult(false, status, string.Empty));

        Assert.Equal(DeliveryOutcome.Failed, (await _delivery.AttemptAsync(Request, Payload)).Outcome);
    }

    [Theory]
    [InlineData(400)]
    [InlineData(404)]
    [InlineData(409)]
    [InlineData(410)]
    [InlineData(422)]
    public async Task AnyOther4xx_IsRejected_RecordedWithTheStatus_AndNotRetried(int status)
    {
        SophiaAnswers(new SophiaDeliveryResult(false, status, "{\"error\":\"unknown engineer\"}"));

        var attempt = await _delivery.AttemptAsync(Request, Payload);

        Assert.Equal(new DeliveryAttempt(DeliveryOutcome.Rejected, 1), attempt);
        await _attempts.Received(1).RecordAsync(41, DeliveryAttemptStatus.DeliveryFailed, "{\"error\":\"unknown engineer\"}", $"HTTP {status}", Arg.Any<CancellationToken>(), Payload);
    }

    [Fact]
    public async Task TheCallbacksRetryAfter_IsPassedOnWithTheFailedAttempt()
    {
        SophiaAnswers(new SophiaDeliveryResult(false, 429, string.Empty, TimeSpan.FromSeconds(200)));

        Assert.Equal(TimeSpan.FromSeconds(200), (await _delivery.AttemptAsync(Request, Payload)).RetryAfter);
    }

    [Fact]
    public async Task TheAttemptThatReachesMaxAttempts_SaysTheAttemptsAreUsedUp()
    {
        GivenFailedBefore(2);
        SophiaAnswers(new SophiaDeliveryResult(false, 502, string.Empty));

        var attempt = await _delivery.AttemptAsync(Request, Payload);

        Assert.Equal(new DeliveryAttempt(DeliveryOutcome.Failed, 3, AttemptsUsedUp: true), attempt);
    }

    [Fact]
    public async Task WhenMaxAttemptsIsAlreadyUsedUp_NothingIsSent()
    {
        GivenFailedBefore(3);

        var attempt = await _delivery.AttemptAsync(Request, Payload);

        Assert.True(attempt.AttemptsUsedUp);
        await _sophia.DidNotReceiveWithAnyArgs().PostCallbackAsync(default, default!, default!, default!, default);
    }

    [Fact]
    public async Task AnUnreachableCallback_IsAFailedAttempt_RecordedWithTheReason()
    {
        SophiaThrows(new ExternalApiUnavailableException("Sophia", "Sophia did not answer", 503));

        var attempt = await _delivery.AttemptAsync(Request, Payload);

        Assert.Equal(new DeliveryAttempt(DeliveryOutcome.Failed, 1, AttemptsUsedUp: false), attempt);
        await _attempts.Received(1).RecordAsync(41, DeliveryAttemptStatus.DeliveryFailed, "{}", "Sophia did not answer", Arg.Any<CancellationToken>(), Payload);
    }

    [Fact]
    public async Task RefusedCredentials_AreTheClientsProblem_NotAnAttempt()
    {
        SophiaThrows(new ExternalAuthenticationException("Sophia", "Sophia rejected our access token (401).", 401));

        var attempt = await _delivery.AttemptAsync(Request, Payload);

        Assert.Equal(DeliveryOutcome.CredentialsRefused, attempt.Outcome);
        await _attempts.DidNotReceiveWithAnyArgs().RecordAsync(default, default!, default!, default, default);
    }

    [Fact]
    public async Task ACallbackRemovedMeanwhile_Revokes()
    {
        SophiaThrows(new CallbackNotConfiguredException("gone"));

        Assert.Equal(DeliveryOutcome.Revoked, (await _delivery.AttemptAsync(Request, Payload)).Outcome);
    }

    [Fact]
    public async Task AClientWithNoActiveConfig_Revokes_WithoutCallingSophia()
    {
        GivenConfig(3, active: false);

        Assert.Equal(DeliveryOutcome.Revoked, (await _delivery.AttemptAsync(Request, Payload)).Outcome);
        await _sophia.DidNotReceiveWithAnyArgs().PostCallbackAsync(default, default!, default!, default!, default);
    }

    /// <summary>A request an administrator retried starts a fresh set of attempts: only attempts since it last entered processing count.</summary>
    [Fact]
    public async Task OnlyAttemptsSinceTheRequestLastEnteredProcessing_Count()
    {
        var queuedOn = new DateTimeOffset(2026, 11, 13, 9, 0, 0, TimeSpan.Zero);
        SophiaAnswers(new SophiaDeliveryResult(true, 200, "{}"));

        await _delivery.AttemptAsync(new RequestLog { Id = 41, ClientRefId = 7, CorrelationId = "c1", EventType = "engineer-stats", CreatedOn = queuedOn.AddDays(-1), QueuedOn = queuedOn }, Payload);

        await _attempts.Received(1).CountDeliveryAttemptsAsync(41, queuedOn, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ThePost_IsNeverCancelled()
    {
        SophiaAnswers(new SophiaDeliveryResult(true, 200, "{}"));

        await _delivery.AttemptAsync(Request, Payload);

        await _sophia.Received(1).PostCallbackAsync(7, "engineer-stats", Payload, "c1", CancellationToken.None);
    }
}
