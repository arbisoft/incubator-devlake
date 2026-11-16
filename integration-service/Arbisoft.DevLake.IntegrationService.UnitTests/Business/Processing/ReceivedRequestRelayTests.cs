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
using Arbisoft.DevLake.IntegrationService.Business.Services.Requests;
using Arbisoft.DevLake.IntegrationService.DataAccess.Messaging;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Options;
using Arbisoft.DevLake.IntegrationService.DataAccess.Persistence;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Arbisoft.DevLake.IntegrationService.UnitTests.TestHelpers;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.Business.Processing;

public class ReceivedRequestRelayTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 13, 12, 0, 0, TimeSpan.Zero);

    private readonly IRequestLogRepository _logs = Substitute.For<IRequestLogRepository>();
    private readonly IRequestQueuePublisher _publisher = Substitute.For<IRequestQueuePublisher>();
    private readonly IRequestAttemptLog _attempts = Substitute.For<IRequestAttemptLog>();
    private readonly IDbSession _session = Substitute.For<IDbSession>();
    private readonly RecordingAuditTrail _audit = new();
    private readonly ReceivedRequestRelay _relay;

    public ReceivedRequestRelayTests()
    {
        _logs.TryChangeStatusAsync(Arg.Any<long>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(true);
        _relay = new ReceivedRequestRelay(
            _logs,
            new RequestStatusTransitions(_logs, _audit, _session),
            _publisher,
            _attempts,
            Options.Create(new ProcessingOptions { RepublishAfterSeconds = 60 }),
            Options.Create(new RabbitMqOptions { MessageTtlSeconds = 7200 }),
            new FakeTimeProvider(Now),
            NullLogger<ReceivedRequestRelay>.Instance);
    }

    private void GivenStuck(params RequestLog[] requests)
    {
        _logs.ListByStatusCreatedBetweenAsync(Arg.Any<string>(), Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(requests);
        foreach (var request in requests)
        {
            _logs.GetJsonAsync(request.Id, Arg.Any<CancellationToken>()).Returns($"{{\"correlation_id\":\"{request.CorrelationId}\"}}");
        }
    }

    private static RequestLog Stuck(long id) => new() { Id = id, CorrelationId = $"c{id}", EventType = "engineer-stats", Status = RequestStatus.Received };

    [Fact]
    public async Task OnlyReceivedRequests_PastTheGraceButStillInsideTheQueueLifetime_AreLookedFor()
    {
        GivenStuck();

        await _relay.RelayAsync(CancellationToken.None);

        await _logs.Received(1).ListByStatusCreatedBetweenAsync(RequestStatus.Received, Now.AddSeconds(-7200), Now.AddSeconds(-60), 100, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task EachStuckRequest_IsPublishedWithItsStoredBody_ThenMarkedQueued()
    {
        GivenStuck(Stuck(1), Stuck(2));
        var published = new List<QueueMessage>();
        await _publisher.PublishAsync(Arg.Do<QueueMessage>(published.Add), Arg.Any<CancellationToken>());

        var relayed = await _relay.RelayAsync(CancellationToken.None);

        Assert.Equal(2, relayed);
        Assert.Equal(["c1", "c2"], published.Select(m => m.CorrelationId));
        Assert.All(published, m => Assert.Equal("engineer-stats", m.EventType));
        Assert.Equal("{\"correlation_id\":\"c1\"}", published[0].Json);
        await _logs.Received(1).TryChangeStatusAsync(1, RequestStatus.Received, RequestStatus.Queued, Arg.Any<CancellationToken>());
        await _logs.Received(1).TryChangeStatusAsync(2, RequestStatus.Received, RequestStatus.Queued, Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData(typeof(QueueFullException))]
    [InlineData(typeof(QueueUnavailableException))]
    public async Task ARefusalFromTheBroker_StopsTheRelay_AndLeavesTheRestReceivedForTheNextRun(Type refusal)
    {
        GivenStuck(Stuck(1), Stuck(2));
        _publisher.PublishAsync(Arg.Any<QueueMessage>(), Arg.Any<CancellationToken>())
            .Returns(_ => Task.FromException((Exception)Activator.CreateInstance(refusal, "refused", null)!));

        var relayed = await _relay.RelayAsync(CancellationToken.None);

        Assert.Equal(0, relayed);
        await _publisher.Received(1).PublishAsync(Arg.Any<QueueMessage>(), Arg.Any<CancellationToken>());
        await _logs.DidNotReceiveWithAnyArgs().TryChangeStatusAsync(default, default!, default!, default);
    }

    [Fact]
    public async Task ARequestWithNoStoredBody_IsMarkedFailedWithAReason_AndTheOthersStillGo()
    {
        GivenStuck(Stuck(1), Stuck(2));
        _logs.GetJsonAsync(1, Arg.Any<CancellationToken>()).Returns((string?)null);

        var relayed = await _relay.RelayAsync(CancellationToken.None);

        Assert.Equal(1, relayed);
        await _logs.Received(1).TryChangeStatusAsync(1, RequestStatus.Received, RequestStatus.Failed, Arg.Any<CancellationToken>());
        await _attempts.Received(1).RecordAsync(1, DeliveryAttemptStatus.PublishFailed, Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
        await _publisher.Received(1).PublishAsync(Arg.Is<QueueMessage>(m => m.CorrelationId == "c2"), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task NothingStuck_PublishesNothing()
    {
        GivenStuck();

        Assert.Equal(0, await _relay.RelayAsync(CancellationToken.None));

        await _publisher.DidNotReceiveWithAnyArgs().PublishAsync(default!, default);
    }
}
