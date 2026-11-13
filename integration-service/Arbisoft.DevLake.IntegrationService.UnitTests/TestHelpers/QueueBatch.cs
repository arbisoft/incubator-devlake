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

namespace Arbisoft.DevLake.IntegrationService.UnitTests.TestHelpers;

/// <summary>
/// For broker tests: takes up to a number of messages through a reader at once, the way a test wants to look at them. Messages the consumer
/// rejects are dead-lettered here, as the processing job does, and are not returned.
/// </summary>
public sealed class QueueBatch : IAsyncDisposable
{
    private readonly IQueueReader _reader;

    private QueueBatch(IQueueReader reader, IReadOnlyList<QueueDelivery> deliveries)
    {
        _reader = reader;
        Deliveries = deliveries;
    }

    public IReadOnlyList<QueueDelivery> Deliveries { get; }

    public static async Task<QueueBatch> TakeAsync(IRequestQueueConsumer consumer, int maxMessages)
    {
        var reader = await consumer.OpenAsync(CancellationToken.None);
        var deliveries = new List<QueueDelivery>();
        while (deliveries.Count < maxMessages && await reader.NextAsync(CancellationToken.None) is { } delivery)
        {
            if (delivery.Rejection is null)
            {
                deliveries.Add(delivery);
            }
            else
            {
                await reader.DeadLetterAsync(delivery, CancellationToken.None);
            }
        }

        return new QueueBatch(reader, deliveries);
    }

    public Task AckAsync(QueueDelivery delivery, CancellationToken cancellationToken) => _reader.AckAsync(delivery, cancellationToken);

    public Task RequeueAsync(QueueDelivery delivery, CancellationToken cancellationToken) => _reader.RequeueAsync(delivery, cancellationToken);

    public Task DeadLetterAsync(QueueDelivery delivery, CancellationToken cancellationToken) => _reader.DeadLetterAsync(delivery, cancellationToken);

    public ValueTask DisposeAsync() => _reader.DisposeAsync();
}
