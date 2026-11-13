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

namespace Arbisoft.DevLake.IntegrationService.DataAccess.Messaging;

public interface IRequestQueueConsumer
{
    /// <summary>
    /// Opens a reader on a channel of its own. The caller takes messages one at a time, as it has room to work on them, and settles each one when
    /// its work is done. Disposing the reader returns every message that was not settled to the queue, so nothing is lost.
    /// </summary>
    /// <exception cref="QueueUnavailableException">The broker could not be reached.</exception>
    Task<IQueueReader> OpenAsync(CancellationToken cancellationToken);

    /// <summary>
    /// How many messages are waiting in the queue. A cheap check that does not take any message, so it does not raise a message's delivery count.
    /// Also the queue-depth figure to publish as a metric.
    /// </summary>
    /// <exception cref="QueueUnavailableException">The broker could not be reached.</exception>
    Task<int> GetDepthAsync(CancellationToken cancellationToken);
}

/// <summary>Takes messages off the queue one at a time, without acknowledging them. Safe to settle from several tasks at once.</summary>
public interface IQueueReader : IAsyncDisposable
{
    /// <summary>
    /// The next message, or null when the queue is empty. A message the consumer cannot accept (an unknown schema version, no correlation ID, or
    /// delivered more often than the limit) comes back with <see cref="QueueDelivery.Rejection"/> set: the caller records why and dead-letters it.
    /// </summary>
    /// <exception cref="QueueUnavailableException">The connection to the broker was lost.</exception>
    Task<QueueDelivery?> NextAsync(CancellationToken cancellationToken);

    /// <summary>The work is done: remove the message from the queue.</summary>
    Task AckAsync(QueueDelivery delivery, CancellationToken cancellationToken);

    /// <summary>The work could not be done now: put the message back so it is delivered again.</summary>
    Task RequeueAsync(QueueDelivery delivery, CancellationToken cancellationToken);

    /// <summary>The message can never succeed: move it to the dead-letter queue.</summary>
    Task DeadLetterAsync(QueueDelivery delivery, CancellationToken cancellationToken);
}
