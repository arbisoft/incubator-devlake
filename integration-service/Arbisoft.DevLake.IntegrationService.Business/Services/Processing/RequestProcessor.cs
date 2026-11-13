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
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Options;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Processing;

public sealed class RequestProcessor : IRequestProcessor
{
    private const int DueBatchSize = 100;

    private readonly IStaleRequestSweeper _sweeper;
    private readonly IReceivedRequestRelay _relay;
    private readonly IRequestLogRepository _requestLogs;
    private readonly IRequestQueueConsumer _consumer;
    private readonly IProcessingPreflight _preflight;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ProcessingOptions _processing;
    private readonly RabbitMqOptions _rabbitMq;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<RequestProcessor> _logger;

    public RequestProcessor(
        IStaleRequestSweeper sweeper,
        IReceivedRequestRelay relay,
        IRequestLogRepository requestLogs,
        IRequestQueueConsumer consumer,
        IProcessingPreflight preflight,
        IServiceScopeFactory scopeFactory,
        IOptions<ProcessingOptions> processing,
        IOptions<RabbitMqOptions> rabbitMq,
        TimeProvider timeProvider,
        ILogger<RequestProcessor> logger)
    {
        _sweeper = sweeper;
        _relay = relay;
        _requestLogs = requestLogs;
        _consumer = consumer;
        _preflight = preflight;
        _scopeFactory = scopeFactory;
        _processing = processing.Value;
        _rabbitMq = rabbitMq.Value;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task<ProcessingRunSummary> ProcessPendingAsync(CancellationToken cancellationToken)
    {
        var expired = await _sweeper.SweepAsync(cancellationToken);
        var republished = await _relay.RelayAsync(cancellationToken);
        var idle = new ProcessingRunSummary(Expired: expired, Republished: republished);

        var now = _timeProvider.GetUtcNow();
        var lifetime = TimeSpan.FromSeconds(_rabbitMq.MessageTtlSeconds + _processing.StaleGraceSeconds);
        var due = await _requestLogs.ListDueAsync(now, now - lifetime, DueBatchSize, cancellationToken);
        if (due.Count == 0 && await _consumer.GetDepthAsync(cancellationToken) == 0)
        {
            return idle;
        }

        var preflight = await _preflight.RunAsync(cancellationToken);
        if (!preflight.Ready)
        {
            _logger.LogError("Processing is paused and requests wait: {Problem}", preflight.Problem);
            return idle with { HaltReason = preflight.Problem };
        }

        var run = new ProcessingRun(now.AddSeconds(_processing.RunBudgetSeconds), _timeProvider);
        var tally = new Tally();
        await TakeWorkAsync(due, run, tally, cancellationToken);
        return tally.Summary(expired, republished, run.HaltReason);
    }

    /// <summary>
    /// Takes one item per free worker, so nothing is taken that cannot be started at once (and so nothing is put back unworked). Due requests go
    /// first, then the queue. Every started item is awaited, even when taking stops because of a shutdown or a lost broker.
    /// </summary>
    private async Task TakeWorkAsync(IReadOnlyList<RequestLog> due, ProcessingRun run, Tally tally, CancellationToken stopping)
    {
        using var slots = new SemaphoreSlim(_processing.MaxParallelRequests, _processing.MaxParallelRequests);
        var started = new List<Task>();
        try
        {
            foreach (var request in due)
            {
                if (!await TakeSlotAsync(slots, run, stopping))
                {
                    return;
                }

                tally.Resumed();
                started.Add(InSlotAsync(slots, () => HandleDueAsync(request, run, tally, stopping)));
            }

            await using var reader = await _consumer.OpenAsync(stopping);
            try
            {
                await TakeMessagesAsync(reader, slots, run, tally, started, stopping);
            }
            finally
            {
                // Messages are settled through the reader, so it must stay open until every started item is done.
                await Task.WhenAll(started);
            }
        }
        catch (OperationCanceledException) when (stopping.IsCancellationRequested)
        {
            _logger.LogInformation("Processing was stopped; work already started is finished first");
        }
        catch (QueueUnavailableException exception)
        {
            _logger.LogWarning(exception, "The broker was lost during the run; messages not yet settled return to the queue");
        }
        finally
        {
            await Task.WhenAll(started);
        }
    }

    private async Task TakeMessagesAsync(IQueueReader reader, SemaphoreSlim slots, ProcessingRun run, Tally tally, List<Task> started, CancellationToken stopping)
    {
        while (await TakeSlotAsync(slots, run, stopping))
        {
            QueueDelivery? delivery;
            try
            {
                delivery = await reader.NextAsync(stopping);
            }
            catch
            {
                slots.Release();
                throw;
            }

            if (delivery is null)
            {
                slots.Release();
                return;
            }

            tally.Taken();
            started.Add(InSlotAsync(slots, () => HandleMessageAsync(reader, delivery, run, tally, stopping)));
        }
    }

    private static async Task<bool> TakeSlotAsync(SemaphoreSlim slots, ProcessingRun run, CancellationToken stopping)
    {
        if (!run.MayTakeWork)
        {
            return false;
        }

        await slots.WaitAsync(stopping);
        if (run.MayTakeWork)
        {
            return true;
        }

        slots.Release();
        return false;
    }

    private static async Task InSlotAsync(SemaphoreSlim slots, Func<Task> work)
    {
        try
        {
            await work();
        }
        finally
        {
            slots.Release();
        }
    }

    /// <summary>Each item gets a scope of its own, so no database connection is shared between parallel items (DAT-16).</summary>
    private async Task HandleDueAsync(RequestLog request, ProcessingRun run, Tally tally, CancellationToken stopping)
    {
        try
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            tally.Step(await scope.ServiceProvider.GetRequiredService<IRequestWorker>().HandleDueAsync(request, run, stopping));
        }
        catch (OperationCanceledException) when (stopping.IsCancellationRequested)
        {
            // Stopped before the request was claimed, or after the worker handed it back: either way it is still due for the next run.
        }
        catch (Exception exception)
        {
            // The request keeps its lease; once that runs out a later run picks it up again.
            _logger.LogError(exception, "Request {CorrelationId} failed unexpectedly and will be tried again later", request.CorrelationId);
        }
    }

    private async Task HandleMessageAsync(IQueueReader reader, QueueDelivery delivery, ProcessingRun run, Tally tally, CancellationToken stopping)
    {
        MessageOutcome outcome;
        try
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var result = await scope.ServiceProvider.GetRequiredService<IRequestWorker>().HandleMessageAsync(delivery, run, stopping);
            tally.Step(result.Step);
            outcome = result.Message;
        }
        catch (Exception exception)
        {
            // A bug or a database problem in one request must not stop the others. The message goes back; the delivery limit parks one that keeps failing.
            if (exception is not OperationCanceledException || !stopping.IsCancellationRequested)
            {
                _logger.LogError(exception, "Request {CorrelationId} failed unexpectedly and will be tried again", delivery.Message.CorrelationId);
            }

            outcome = MessageOutcome.Requeue;
        }

        await SettleAsync(reader, delivery, outcome, tally);
    }

    /// <summary>Settled even during a shutdown, so finished work is never delivered again. A lost broker returns the message to the queue by itself.</summary>
    private async Task SettleAsync(IQueueReader reader, QueueDelivery delivery, MessageOutcome outcome, Tally tally)
    {
        try
        {
            switch (outcome)
            {
                case MessageOutcome.Ack:
                    await reader.AckAsync(delivery, CancellationToken.None);
                    break;
                case MessageOutcome.DeadLetter:
                    await reader.DeadLetterAsync(delivery, CancellationToken.None);
                    tally.DeadLettered();
                    break;
                default:
                    await reader.RequeueAsync(delivery, CancellationToken.None);
                    tally.Requeued();
                    break;
            }
        }
        catch (QueueUnavailableException exception)
        {
            _logger.LogWarning(exception, "Message {CorrelationId} could not be settled; the broker will deliver it again", delivery.Message.CorrelationId);
        }
    }

    /// <summary>Counts for the run summary, updated from parallel items.</summary>
    private sealed class Tally
    {
        private int _taken;
        private int _resumed;
        private int _finished;
        private int _deferred;
        private int _deadLettered;
        private int _requeued;

        public void Taken() => Interlocked.Increment(ref _taken);

        public void Resumed() => Interlocked.Increment(ref _resumed);

        public void DeadLettered() => Interlocked.Increment(ref _deadLettered);

        public void Requeued() => Interlocked.Increment(ref _requeued);

        public void Step(StepResult step)
        {
            if (step == StepResult.Finished)
            {
                Interlocked.Increment(ref _finished);
            }
            else if (step == StepResult.Deferred)
            {
                Interlocked.Increment(ref _deferred);
            }
        }

        public ProcessingRunSummary Summary(int expired, int republished, string? haltReason) =>
            new(_taken, _resumed, _finished, _deferred, _deadLettered, _requeued, expired, republished, haltReason);
    }
}
