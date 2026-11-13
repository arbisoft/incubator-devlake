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

using System.Collections.Concurrent;
using Arbisoft.DevLake.IntegrationService.Business.Services.Processing;
using Arbisoft.DevLake.IntegrationService.DataAccess.Messaging;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Options;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.Business.Processing;

public sealed class RequestProcessorTests : IDisposable
{
    private static readonly DateTimeOffset Now = new(2026, 11, 13, 12, 0, 0, TimeSpan.Zero);
    private static readonly WorkResult Finished = new(MessageOutcome.Ack, StepResult.Finished);

    private readonly IStaleRequestSweeper _sweeper = Substitute.For<IStaleRequestSweeper>();
    private readonly IReceivedRequestRelay _relay = Substitute.For<IReceivedRequestRelay>();
    private readonly IRequestLogRepository _logs = Substitute.For<IRequestLogRepository>();
    private readonly IRequestQueueConsumer _consumer = Substitute.For<IRequestQueueConsumer>();
    private readonly IProcessingPreflight _preflight = Substitute.For<IProcessingPreflight>();
    private readonly FakeTimeProvider _time = new(Now);
    private readonly FakeReader _reader = new();
    private readonly ConcurrentDictionary<ulong, Func<ProcessingRun, CancellationToken, Task<WorkResult>>> _messages = new();
    private readonly ConcurrentDictionary<long, Func<ProcessingRun, CancellationToken, Task<StepResult>>> _due = new();
    private ServiceProvider _services = null!;
    private int _scopesCreated;

    public RequestProcessorTests()
    {
        _consumer.GetDepthAsync(Arg.Any<CancellationToken>()).Returns(_ => _reader.Count);
        _consumer.OpenAsync(Arg.Any<CancellationToken>()).Returns(_reader);
        _logs.ListDueAsync(Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<int>(), Arg.Any<CancellationToken>()).Returns([]);
        _preflight.RunAsync(Arg.Any<CancellationToken>()).Returns(PreflightResult.Go);
    }

    public void Dispose()
    {
        _services?.Dispose();
    }

    private RequestProcessor Create(int maxParallel = 4, int budgetSeconds = 120)
    {
        var services = new ServiceCollection();
        services.AddScoped<IRequestWorker>(_ =>
        {
            Interlocked.Increment(ref _scopesCreated);
            return new ScriptedWorker(_messages, _due);
        });
        _services = services.BuildServiceProvider();
        return new RequestProcessor(
            _sweeper,
            _relay,
            _logs,
            _consumer,
            _preflight,
            _services.GetRequiredService<IServiceScopeFactory>(),
            Options.Create(new ProcessingOptions { MaxParallelRequests = maxParallel, RunBudgetSeconds = budgetSeconds, StaleGraceSeconds = 60 }),
            Options.Create(new RabbitMqOptions { MessageTtlSeconds = 7200 }),
            _time,
            NullLogger<RequestProcessor>.Instance);
    }

    private List<QueueDelivery> Messages(params WorkResult[] results)
    {
        var deliveries = new List<QueueDelivery>();
        foreach (var result in results)
        {
            var tag = (ulong)(_reader.Count + deliveries.Count + 1);
            var delivery = new QueueDelivery(new QueueMessage($"c{tag}", "engineer-stats", "{}"), tag, false, 0);
            _messages[tag] = (_, _) => Task.FromResult(result);
            deliveries.Add(delivery);
        }

        _reader.Add(deliveries);
        return deliveries;
    }

    private void DueRequests(params long[] ids)
    {
        _logs.ListDueAsync(Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(ids.Select(id => new RequestLog { Id = id, CorrelationId = $"d{id}", Status = RequestStatus.Processing }).ToList());
        foreach (var id in ids)
        {
            _due[id] = (_, _) => Task.FromResult(StepResult.Finished);
        }
    }

    [Fact]
    public async Task WithNothingDueAndAnEmptyQueue_TheRunStops_BeforeCheckingDevLake()
    {
        var summary = await Create().ProcessPendingAsync(CancellationToken.None);

        Assert.False(summary.DidWork);
        await _preflight.DidNotReceiveWithAnyArgs().RunAsync(default);
        await _consumer.DidNotReceiveWithAnyArgs().OpenAsync(default);
    }

    [Fact]
    public async Task TheSweepAndTheRelayComeFirst_AndTheirCountsAreReported()
    {
        _sweeper.SweepAsync(Arg.Any<CancellationToken>()).Returns(2);
        _relay.RelayAsync(Arg.Any<CancellationToken>()).Returns(1);

        var summary = await Create().ProcessPendingAsync(CancellationToken.None);

        Assert.Equal(new ProcessingRunSummary(Expired: 2, Republished: 1), summary);
        Assert.True(summary.DidWork);
        Received.InOrder(() =>
        {
            _sweeper.SweepAsync(Arg.Any<CancellationToken>());
            _relay.RelayAsync(Arg.Any<CancellationToken>());
            _logs.ListDueAsync(Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<int>(), Arg.Any<CancellationToken>());
            _consumer.GetDepthAsync(Arg.Any<CancellationToken>());
        });
    }

    [Fact]
    public async Task DueRequests_AreLookedForWithinTheRequestLifetime()
    {
        await Create().ProcessPendingAsync(CancellationToken.None);

        await _logs.Received(1).ListDueAsync(Now, Now.AddSeconds(-(7200 + 60)), 100, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task WhenDevLakeIsNotUsable_NothingIsTaken_SoNoMessageIsDisturbed()
    {
        Messages(Finished);
        DueRequests(1);
        _preflight.RunAsync(Arg.Any<CancellationToken>()).Returns(PreflightResult.Stop("DevLake rejected our API token."));

        var summary = await Create().ProcessPendingAsync(CancellationToken.None);

        Assert.Equal("DevLake rejected our API token.", summary.HaltReason);
        Assert.Equal(0, summary.MessagesTaken + summary.Resumed);
        await _consumer.DidNotReceiveWithAnyArgs().OpenAsync(default);
        Assert.Equal(1, _reader.Count);
    }

    [Fact]
    public async Task DueRequestsAreResumedFirst_ThenTheQueueIsEmptied()
    {
        var order = new ConcurrentQueue<string>();
        DueRequests(7);
        _due[7] = (_, _) =>
        {
            order.Enqueue("due");
            return Task.FromResult(StepResult.Finished);
        };
        var messages = Messages(Finished, Finished);
        foreach (var message in messages)
        {
            _messages[message.DeliveryTag] = (_, _) =>
            {
                order.Enqueue("message");
                return Task.FromResult(Finished);
            };
        }

        var summary = await Create(maxParallel: 1).ProcessPendingAsync(CancellationToken.None);

        Assert.Equal(["due", "message", "message"], order);
        Assert.Equal(new ProcessingRunSummary(MessagesTaken: 2, Resumed: 1, Finished: 3), summary);
        Assert.Equal(0, _reader.Count);
    }

    /// <summary>The run keeps going while the queue has messages (#9): far more than one batch is processed in one run.</summary>
    [Fact]
    public async Task OneRun_TakesEveryWaitingMessage_NotJustOneBatch()
    {
        Messages(Enumerable.Repeat(Finished, 35).ToArray());

        var summary = await Create().ProcessPendingAsync(CancellationToken.None);

        Assert.Equal(35, summary.MessagesTaken);
        Assert.Equal(35, _reader.Acked.Count);
    }

    [Fact]
    public async Task EachMessage_IsSettledAsItsWorkSays()
    {
        var deliveries = Messages(Finished, WorkResult.DeadLettered, new WorkResult(MessageOutcome.Requeue, StepResult.Skipped), new WorkResult(MessageOutcome.Ack, StepResult.Deferred));

        var summary = await Create().ProcessPendingAsync(CancellationToken.None);

        Assert.Equal(new ProcessingRunSummary(MessagesTaken: 4, Finished: 1, Deferred: 1, DeadLettered: 1, Requeued: 1), summary);
        Assert.Equal([deliveries[0].DeliveryTag, deliveries[3].DeliveryTag], _reader.Acked.Order());
        Assert.Equal([deliveries[1].DeliveryTag], _reader.DeadLettered);
        Assert.Equal([deliveries[2].DeliveryTag], _reader.Requeued);
    }

    /// <summary>A message is taken only when a worker is free for it (#2), so nothing is put back just because the run stopped.</summary>
    [Fact]
    public async Task ANewMessageIsTakenOnlyWhenAWorkerIsFree()
    {
        var release = new TaskCompletionSource<WorkResult>();
        var deliveries = Messages(Finished, Finished, Finished);
        _messages[deliveries[0].DeliveryTag] = (_, _) => release.Task;

        var run = Create(maxParallel: 1).ProcessPendingAsync(CancellationToken.None);
        await WaitUntilAsync(() => _reader.NextCalls >= 1);
        await Task.Delay(50);
        Assert.Equal(1, _reader.NextCalls);

        release.SetResult(Finished);
        await run;
        Assert.Equal(3, _reader.Acked.Count);
    }

    [Fact]
    public async Task NoMoreItemsThanTheConfiguredNumber_AreWorkedOnAtOnce()
    {
        var deliveries = Messages(Enumerable.Repeat(Finished, 6).ToArray());
        var running = 0;
        var peak = 0;
        foreach (var delivery in deliveries)
        {
            _messages[delivery.DeliveryTag] = async (_, token) =>
            {
                var now = Interlocked.Increment(ref running);
                InterlockedMax(ref peak, now);
                await Task.Delay(60, token);
                Interlocked.Decrement(ref running);
                return Finished;
            };
        }

        var summary = await Create(maxParallel: 2).ProcessPendingAsync(CancellationToken.None);

        Assert.Equal(6, summary.Finished);
        Assert.Equal(2, peak);
    }

    [Fact]
    public async Task EveryItem_GetsAScopeOfItsOwn_SoNoDatabaseConnectionIsSharedBetweenParallelItems()
    {
        DueRequests(1);
        Messages(Finished, Finished);

        await Create().ProcessPendingAsync(CancellationToken.None);

        Assert.Equal(3, _scopesCreated);
    }

    [Fact]
    public async Task WhenDevLakeFailsMidRun_NoFurtherWorkIsTaken_AndTheRestStaysOnTheQueue()
    {
        var deliveries = Messages(Finished, Finished, Finished);
        _messages[deliveries[0].DeliveryTag] = (run, _) =>
        {
            run.Halt("DevLake failed during the run");
            return Task.FromResult(new WorkResult(MessageOutcome.Ack, StepResult.Deferred));
        };

        var summary = await Create(maxParallel: 1).ProcessPendingAsync(CancellationToken.None);

        Assert.Equal("DevLake failed during the run", summary.HaltReason);
        Assert.Equal(1, summary.MessagesTaken);
        Assert.Equal(2, _reader.Count);
        Assert.Empty(_reader.Requeued);
    }

    [Fact]
    public async Task OnceTheRunsTimeBudgetIsUsed_NoFurtherWorkIsTaken()
    {
        var deliveries = Messages(Finished, Finished, Finished);
        _messages[deliveries[0].DeliveryTag] = (_, _) =>
        {
            _time.Advance(TimeSpan.FromSeconds(121));
            return Task.FromResult(Finished);
        };

        var summary = await Create(maxParallel: 1, budgetSeconds: 120).ProcessPendingAsync(CancellationToken.None);

        Assert.Equal(1, summary.MessagesTaken);
        Assert.Equal(2, _reader.Count);
    }

    [Fact]
    public async Task AMessageWhoseWorkThrows_IsPutBack_AndTheOthersAreStillWorked()
    {
        var deliveries = Messages(Finished, Finished, Finished);
        _messages[deliveries[1].DeliveryTag] = (_, _) => Task.FromException<WorkResult>(new InvalidOperationException("database exploded"));

        var summary = await Create().ProcessPendingAsync(CancellationToken.None);

        Assert.Equal(2, summary.Finished);
        Assert.Equal([deliveries[1].DeliveryTag], _reader.Requeued);
    }

    [Fact]
    public async Task ADueRequestWhoseWorkThrows_DoesNotStopTheRun()
    {
        DueRequests(1, 2);
        _due[1] = (_, _) => Task.FromException<StepResult>(new InvalidOperationException("database exploded"));
        Messages(Finished);

        var summary = await Create().ProcessPendingAsync(CancellationToken.None);

        Assert.Equal(2, summary.Finished);
        Assert.Equal(2, summary.Resumed);
    }

    [Fact]
    public async Task AShutdown_TakesNoMoreWork_FinishesAndSettlesWhatStarted_AndDoesNotThrow()
    {
        using var stopping = new CancellationTokenSource();
        var deliveries = Messages(Finished, Finished, Finished);
        _messages[deliveries[0].DeliveryTag] = async (_, _) =>
        {
            await stopping.CancelAsync();
            return new WorkResult(MessageOutcome.Ack, StepResult.Deferred);
        };

        var summary = await Create(maxParallel: 1).ProcessPendingAsync(stopping.Token);

        Assert.Equal(1, summary.MessagesTaken);
        Assert.Equal([deliveries[0].DeliveryTag], _reader.Acked);
        Assert.Equal(2, _reader.Count);
    }

    [Fact]
    public async Task AShutdownWhileADueRequestIsWorked_DoesNotThrow()
    {
        using var stopping = new CancellationTokenSource();
        DueRequests(1);
        _due[1] = async (_, token) =>
        {
            await stopping.CancelAsync();
            token.ThrowIfCancellationRequested();
            return StepResult.Finished;
        };

        var summary = await Create().ProcessPendingAsync(stopping.Token);

        Assert.Equal(1, summary.Resumed);
        Assert.Equal(0, summary.Finished);
    }

    [Fact]
    public async Task WhenTheBrokerIsLostWhileSettling_TheRunCarriesOn_AndDoesNotThrow()
    {
        var deliveries = Messages(Finished, Finished);
        _reader.FailAckFor = deliveries[0].DeliveryTag;

        var summary = await Create().ProcessPendingAsync(CancellationToken.None);

        Assert.Equal(2, summary.Finished);
        Assert.Equal([deliveries[1].DeliveryTag], _reader.Acked);
    }

    [Fact]
    public async Task WhenTheBrokerIsLostWhileTakingAMessage_WorkAlreadyStartedStillFinishes()
    {
        Messages(Finished);
        _reader.FailNextAfter = 1;

        var summary = await Create(maxParallel: 1).ProcessPendingAsync(CancellationToken.None);

        Assert.Equal(1, summary.Finished);
        Assert.Single(_reader.Acked);
    }

    [Fact]
    public async Task TheReaderIsAlwaysDisposed_SoUnsettledMessagesReturnToTheQueue()
    {
        Messages(Finished);

        await Create().ProcessPendingAsync(CancellationToken.None);

        Assert.True(_reader.Disposed);
    }

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        for (var i = 0; i < 200 && !condition(); i++)
        {
            await Task.Delay(10);
        }

        Assert.True(condition());
    }

    private static void InterlockedMax(ref int target, int value)
    {
        int seen;
        do
        {
            seen = Volatile.Read(ref target);
        }
        while (value > seen && Interlocked.CompareExchange(ref target, value, seen) != seen);
    }

    private sealed class ScriptedWorker : IRequestWorker
    {
        private readonly ConcurrentDictionary<ulong, Func<ProcessingRun, CancellationToken, Task<WorkResult>>> _messages;
        private readonly ConcurrentDictionary<long, Func<ProcessingRun, CancellationToken, Task<StepResult>>> _due;

        public ScriptedWorker(
            ConcurrentDictionary<ulong, Func<ProcessingRun, CancellationToken, Task<WorkResult>>> messages,
            ConcurrentDictionary<long, Func<ProcessingRun, CancellationToken, Task<StepResult>>> due)
        {
            _messages = messages;
            _due = due;
        }

        public Task<WorkResult> HandleMessageAsync(QueueDelivery delivery, ProcessingRun run, CancellationToken stopping) => _messages[delivery.DeliveryTag](run, stopping);

        public Task<StepResult> HandleDueAsync(RequestLog request, ProcessingRun run, CancellationToken stopping) => _due[request.Id](run, stopping);
    }

    /// <summary>An in-memory queue: what was taken, and how each message was settled.</summary>
    private sealed class FakeReader : IQueueReader
    {
        private readonly ConcurrentQueue<QueueDelivery> _waiting = new();
        private int _nextCalls;

        public int Count => _waiting.Count;

        public int NextCalls => Volatile.Read(ref _nextCalls);

        public ConcurrentQueue<ulong> Acked { get; } = new();

        public ConcurrentQueue<ulong> Requeued { get; } = new();

        public ConcurrentQueue<ulong> DeadLettered { get; } = new();

        public ulong? FailAckFor { get; set; }

        public int? FailNextAfter { get; set; }

        public bool Disposed { get; private set; }

        public void Add(IEnumerable<QueueDelivery> deliveries)
        {
            foreach (var delivery in deliveries)
            {
                _waiting.Enqueue(delivery);
            }
        }

        public Task<QueueDelivery?> NextAsync(CancellationToken cancellationToken)
        {
            var calls = Interlocked.Increment(ref _nextCalls);
            if (FailNextAfter is { } after && calls > after)
            {
                return Task.FromException<QueueDelivery?>(new QueueUnavailableException("gone"));
            }

            return Task.FromResult(_waiting.TryDequeue(out var delivery) ? delivery : null);
        }

        public Task AckAsync(QueueDelivery delivery, CancellationToken cancellationToken)
        {
            if (delivery.DeliveryTag == FailAckFor)
            {
                return Task.FromException(new QueueUnavailableException("gone"));
            }

            Acked.Enqueue(delivery.DeliveryTag);
            return Task.CompletedTask;
        }

        public Task RequeueAsync(QueueDelivery delivery, CancellationToken cancellationToken)
        {
            Requeued.Enqueue(delivery.DeliveryTag);
            return Task.CompletedTask;
        }

        public Task DeadLetterAsync(QueueDelivery delivery, CancellationToken cancellationToken)
        {
            DeadLettered.Enqueue(delivery.DeliveryTag);
            return Task.CompletedTask;
        }

        public ValueTask DisposeAsync()
        {
            Disposed = true;
            return ValueTask.CompletedTask;
        }
    }
}
