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

using Arbisoft.DevLake.IntegrationService.DataAccess.Messaging;
using Arbisoft.DevLake.IntegrationService.DataAccess.Options;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using RabbitMQ.Client.Exceptions;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.DataAccess.Messaging;

public class RequestQueueConsumerTests
{
    private readonly IRabbitMqConnection _connection = Substitute.For<IRabbitMqConnection>();
    private readonly IChannel _channel = Substitute.For<IChannel>();
    private readonly RequestQueueConsumer _consumer;

    public RequestQueueConsumerTests()
    {
        _connection.CreateChannelAsync(false, Arg.Any<CancellationToken>()).Returns(_channel);
        _consumer = new RequestQueueConsumer(_connection, Options.Create(new RabbitMqOptions { RequestQueueName = "q", DeliveryLimit = 5 }), NullLogger<RequestQueueConsumer>.Instance);
    }

    private static BasicGetResult Result(ulong tag, object? schemaVersion = null, string? correlationId = "cid", string? type = "engineer-stats", string body = "{}", bool redelivered = false, long? acquiredCount = null)
    {
        var headers = new Dictionary<string, object?>();
        if (schemaVersion is not null)
        {
            headers[QueueConstants.SchemaVersionHeader] = schemaVersion;
        }

        if (acquiredCount is not null)
        {
            headers[QueueConstants.AcquiredCountHeader] = acquiredCount;
        }

        var properties = new BasicProperties { CorrelationId = correlationId, Type = type, MessageId = "mid", Headers = headers };
        return new BasicGetResult(tag, redelivered, string.Empty, "q", 0, properties, System.Text.Encoding.UTF8.GetBytes(body));
    }

    private void Queue(params BasicGetResult?[] results)
    {
        var sequence = results.Append(null).ToArray();
        _channel.BasicGetAsync("q", false, Arg.Any<CancellationToken>()).Returns(Task.FromResult(sequence[0]), sequence[1..].Select(Task.FromResult).ToArray());
    }

    [Fact]
    public async Task Next_ReturnsAReadableMessageWithItsDeliveryDetails()
    {
        Queue(Result(7, schemaVersion: 1, body: "{\"a\":1}", redelivered: true, acquiredCount: 2));
        await using var reader = await _consumer.OpenAsync(CancellationToken.None);

        var delivery = await reader.NextAsync(CancellationToken.None);

        Assert.NotNull(delivery);
        Assert.Equal(new QueueMessage("cid", "engineer-stats", "{\"a\":1}"), delivery.Message);
        Assert.Equal(7UL, delivery.DeliveryTag);
        Assert.True(delivery.Redelivered);
        Assert.Equal(2, delivery.DeliveryCount);
        Assert.Null(delivery.Rejection);
    }

    [Fact]
    public async Task Next_TakesOneMessagePerCall_AndNullWhenTheQueueIsEmpty()
    {
        Queue(Result(1, 1), Result(2, 1));
        await using var reader = await _consumer.OpenAsync(CancellationToken.None);

        Assert.Equal(1UL, (await reader.NextAsync(CancellationToken.None))!.DeliveryTag);
        await _channel.Received(1).BasicGetAsync("q", false, Arg.Any<CancellationToken>());
        Assert.Equal(2UL, (await reader.NextAsync(CancellationToken.None))!.DeliveryTag);
        Assert.Null(await reader.NextAsync(CancellationToken.None));
    }

    [Fact]
    public async Task Open_TakesNothingByItself()
    {
        await using var reader = await _consumer.OpenAsync(CancellationToken.None);

        await _channel.DidNotReceiveWithAnyArgs().BasicGetAsync(default!, default, default);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    [InlineData(2)]
    [InlineData(99)]
    [InlineData("1")]
    public async Task Next_AnUnsupportedOrMissingSchemaVersion_IsReturnedRejected_ForTheCallerToRecordAndDeadLetter(object? version)
    {
        Queue(Result(9, version));
        await using var reader = await _consumer.OpenAsync(CancellationToken.None);

        var delivery = await reader.NextAsync(CancellationToken.None);

        Assert.Contains("schema version", delivery!.Rejection, StringComparison.Ordinal);
        Assert.Equal("cid", delivery.Message.CorrelationId);
        await _channel.DidNotReceiveWithAnyArgs().BasicNackAsync(default, default, default, default);
    }

    [Theory]
    [InlineData(null, "engineer-stats")]
    [InlineData("cid", null)]
    public async Task Next_AMessageWithoutACorrelationIdOrType_IsReturnedRejected(string? correlationId, string? type)
    {
        Queue(Result(4, 1, correlationId, type));
        await using var reader = await _consumer.OpenAsync(CancellationToken.None);

        var delivery = await reader.NextAsync(CancellationToken.None);

        Assert.Contains("correlation ID", delivery!.Rejection, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Next_AMessageDeliveredTooOften_IsReturnedRejected_ButOneAtTheLimitIsAccepted()
    {
        Queue(Result(1, 1, acquiredCount: 5), Result(2, 1, acquiredCount: 6));
        await using var reader = await _consumer.OpenAsync(CancellationToken.None);

        Assert.Null((await reader.NextAsync(CancellationToken.None))!.Rejection);
        Assert.Contains("over the limit of 5", (await reader.NextAsync(CancellationToken.None))!.Rejection, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Next_IgnoresUnknownHeadersAndFields_AndStillReadsAnUnknownBodyShape()
    {
        var result = Result(5, 1, body: "{\"email\":\"a@arbisoft.com\",\"somethingNew\":[1,2,3]}");
        result.BasicProperties.Headers!["x-future-header"] = "whatever";
        Queue(result);
        await using var reader = await _consumer.OpenAsync(CancellationToken.None);

        Assert.Contains("somethingNew", (await reader.NextAsync(CancellationToken.None))!.Message.Json, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Next_WhenTheConnectionDrops_ThrowsQueueUnavailable()
    {
        _channel.BasicGetAsync("q", false, Arg.Any<CancellationToken>())
            .Returns(_ => Task.FromException<BasicGetResult?>(new AlreadyClosedException(new ShutdownEventArgs(ShutdownInitiator.Peer, 320, "gone"))));
        await using var reader = await _consumer.OpenAsync(CancellationToken.None);

        await Assert.ThrowsAsync<QueueUnavailableException>(() => reader.NextAsync(CancellationToken.None));
    }

    [Fact]
    public async Task Disposing_TheReader_ReleasesTheChannel_EvenWhenTheChannelIsAlreadyGone()
    {
        _channel.DisposeAsync().Returns(_ => ValueTask.FromException(new AlreadyClosedException(new ShutdownEventArgs(ShutdownInitiator.Peer, 320, "gone"))));
        var reader = await _consumer.OpenAsync(CancellationToken.None);

        await reader.DisposeAsync();

        await _channel.Received(1).DisposeAsync();
    }

    [Fact]
    public async Task GetDepth_ReportsTheMessagesWaiting_WithoutTakingAny()
    {
        _channel.QueueDeclarePassiveAsync("q", Arg.Any<CancellationToken>()).Returns(new QueueDeclareOk("q", 12, 0));

        var depth = await _consumer.GetDepthAsync(CancellationToken.None);

        Assert.Equal(12, depth);
        await _channel.DidNotReceiveWithAnyArgs().BasicGetAsync(default!, default, default);
        await _channel.Received(1).DisposeAsync();
    }

    [Fact]
    public async Task GetDepth_WhenTheBrokerIsLost_ThrowsQueueUnavailable()
    {
        _channel.QueueDeclarePassiveAsync("q", Arg.Any<CancellationToken>())
            .Returns(_ => Task.FromException<QueueDeclareOk>(new AlreadyClosedException(new ShutdownEventArgs(ShutdownInitiator.Peer, 320, "gone"))));

        await Assert.ThrowsAsync<QueueUnavailableException>(() => _consumer.GetDepthAsync(CancellationToken.None));
    }

    [Fact]
    public async Task AckRequeueAndDeadLetter_MapToTheMatchingBrokerCalls()
    {
        Queue(Result(1, 1), Result(2, 1), Result(3, 1));
        await using var reader = await _consumer.OpenAsync(CancellationToken.None);
        var first = await reader.NextAsync(CancellationToken.None);
        var second = await reader.NextAsync(CancellationToken.None);
        var third = await reader.NextAsync(CancellationToken.None);

        await reader.AckAsync(first!, CancellationToken.None);
        await reader.RequeueAsync(second!, CancellationToken.None);
        await reader.DeadLetterAsync(third!, CancellationToken.None);

        await _channel.Received(1).BasicAckAsync(1, false, Arg.Any<CancellationToken>());
        await _channel.Received(1).BasicNackAsync(2, false, true, Arg.Any<CancellationToken>());
        await _channel.Received(1).BasicNackAsync(3, false, false, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task AckOnALostChannel_ThrowsQueueUnavailable()
    {
        Queue(Result(1, 1));
        await using var reader = await _consumer.OpenAsync(CancellationToken.None);
        var delivery = await reader.NextAsync(CancellationToken.None);
        _channel.BasicAckAsync(1, false, Arg.Any<CancellationToken>())
            .Returns(_ => ValueTask.FromException(new AlreadyClosedException(new ShutdownEventArgs(ShutdownInitiator.Peer, 320, "gone"))));

        await Assert.ThrowsAsync<QueueUnavailableException>(() => reader.AckAsync(delivery!, CancellationToken.None));
    }

    /// <summary>Parallel workers settle their own messages; a channel is not safe for concurrent use, so the reader lets one call through at a time.</summary>
    [Fact]
    public async Task SettlingFromManyTasksAtOnce_ReachesTheChannelOneCallAtATime()
    {
        var inFlight = 0;
        var peak = 0;
        async Task SlowAckAsync()
        {
            var now = Interlocked.Increment(ref inFlight);
            peak = Math.Max(peak, now);
            await Task.Delay(10);
            Interlocked.Decrement(ref inFlight);
        }

        _channel.BasicAckAsync(Arg.Any<ulong>(), false, Arg.Any<CancellationToken>()).Returns(_ => new ValueTask(SlowAckAsync()));
        await using var reader = await _consumer.OpenAsync(CancellationToken.None);
        var deliveries = Enumerable.Range(1, 8).Select(tag => new QueueDelivery(new QueueMessage("c", "t", "{}"), (ulong)tag, false, 0)).ToList();

        await Task.WhenAll(deliveries.Select(delivery => reader.AckAsync(delivery, CancellationToken.None)));

        Assert.Equal(1, peak);
    }
}
