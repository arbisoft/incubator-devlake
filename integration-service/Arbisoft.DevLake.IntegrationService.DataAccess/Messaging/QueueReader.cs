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

using RabbitMQ.Client;
using RabbitMQ.Client.Exceptions;

namespace Arbisoft.DevLake.IntegrationService.DataAccess.Messaging;

/// <inheritdoc />
public sealed class QueueReader : IQueueReader
{
    private readonly IChannel _channel;
    private readonly Func<IChannel, CancellationToken, Task<QueueDelivery?>> _next;
    private readonly SemaphoreSlim _channelLock = new(1, 1);

    public QueueReader(IChannel channel, Func<IChannel, CancellationToken, Task<QueueDelivery?>> next)
    {
        _channel = channel;
        _next = next;
    }

    public Task<QueueDelivery?> NextAsync(CancellationToken cancellationToken)
    {
        return RunAsync(() => _next(_channel, cancellationToken), cancellationToken);
    }

    public Task AckAsync(QueueDelivery delivery, CancellationToken cancellationToken)
    {
        return RunAsync(() => _channel.BasicAckAsync(delivery.DeliveryTag, multiple: false, cancellationToken), cancellationToken);
    }

    public Task RequeueAsync(QueueDelivery delivery, CancellationToken cancellationToken)
    {
        return RunAsync(() => _channel.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: true, cancellationToken), cancellationToken);
    }

    public Task DeadLetterAsync(QueueDelivery delivery, CancellationToken cancellationToken)
    {
        return RunAsync(() => _channel.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: false, cancellationToken), cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            await _channel.DisposeAsync();
        }
        catch (Exception exception) when (exception is AlreadyClosedException or OperationInterruptedException or IOException)
        {
            // A closed channel has already returned its unacknowledged messages to the queue.
        }
        finally
        {
            _channelLock.Dispose();
        }
    }

    private async Task RunAsync(Func<ValueTask> action, CancellationToken cancellationToken)
    {
        await RunAsync<bool>(
            async () =>
            {
                await action();
                return true;
            },
            cancellationToken);
    }

    /// <summary>One channel call at a time: a channel is not safe for concurrent use, and parallel workers settle their own messages.</summary>
    private async Task<T> RunAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken)
    {
        await _channelLock.WaitAsync(cancellationToken);
        try
        {
            return await action();
        }
        catch (Exception exception) when (exception is AlreadyClosedException or OperationInterruptedException or IOException)
        {
            throw new QueueUnavailableException("The connection to the broker was lost; unacknowledged messages will be delivered again.", exception);
        }
        finally
        {
            _channelLock.Release();
        }
    }
}
