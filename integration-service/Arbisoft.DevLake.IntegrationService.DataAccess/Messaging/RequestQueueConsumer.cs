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

using System.Text;
using Arbisoft.DevLake.IntegrationService.DataAccess.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Exceptions;

namespace Arbisoft.DevLake.IntegrationService.DataAccess.Messaging;

/// <summary>
/// Pulls messages with BasicGet on a channel of its own (INT-Q7), with manual acknowledgement (INT-Q3). A pull consumer has no prefetch: the
/// caller takes a message only when it has a free worker for it, which bounds the work in flight (INT-Q4). It accepts only schema versions it
/// understands (INT-M3, INT-M4) and rejects a message that has been redelivered too often, so the caller can record why and dead-letter it (INT-6).
/// </summary>
public sealed class RequestQueueConsumer : IRequestQueueConsumer
{
    private readonly IRabbitMqConnection _connection;
    private readonly RabbitMqOptions _options;
    private readonly ILogger<RequestQueueConsumer> _logger;

    public RequestQueueConsumer(IRabbitMqConnection connection, IOptions<RabbitMqOptions> options, ILogger<RequestQueueConsumer> logger)
    {
        _connection = connection;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<IQueueReader> OpenAsync(CancellationToken cancellationToken)
    {
        var channel = await _connection.CreateChannelAsync(publisherConfirms: false, cancellationToken);
        return new QueueReader(channel, NextAsync);
    }

    public async Task<int> GetDepthAsync(CancellationToken cancellationToken)
    {
        await using var channel = await _connection.CreateChannelAsync(publisherConfirms: false, cancellationToken);
        try
        {
            var queue = await channel.QueueDeclarePassiveAsync(_options.RequestQueueName, cancellationToken);
            return checked((int)queue.MessageCount);
        }
        catch (Exception exception) when (exception is AlreadyClosedException or OperationInterruptedException or IOException)
        {
            throw new QueueUnavailableException("The connection to the broker was lost while checking the queue.", exception);
        }
    }

    private async Task<QueueDelivery?> NextAsync(IChannel channel, CancellationToken cancellationToken)
    {
        var result = await channel.BasicGetAsync(_options.RequestQueueName, autoAck: false, cancellationToken);
        return result is null ? null : Read(result);
    }

    private QueueDelivery Read(BasicGetResult result)
    {
        var properties = result.BasicProperties;
        var earlierDeliveries = ReadInt(properties.Headers, QueueConstants.AcquiredCountHeader) ?? 0;
        var message = new QueueMessage(properties.CorrelationId ?? string.Empty, properties.Type ?? string.Empty, Encoding.UTF8.GetString(result.Body.Span));
        return new QueueDelivery(message, result.DeliveryTag, result.Redelivered, earlierDeliveries, RejectionOf(properties, earlierDeliveries));
    }

    private string? RejectionOf(IReadOnlyBasicProperties properties, int earlierDeliveries)
    {
        var version = ReadInt(properties.Headers, QueueConstants.SchemaVersionHeader);
        if (version is null or < 1 or > QueueConstants.CurrentSchemaVersion)
        {
            _logger.LogWarning("Rejecting message {MessageId}: unsupported schema version {Version}", properties.MessageId, version);
            return $"The message has an unsupported schema version ({version?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "none"}).";
        }

        if (string.IsNullOrEmpty(properties.CorrelationId) || string.IsNullOrEmpty(properties.Type))
        {
            _logger.LogWarning("Rejecting message {MessageId}: missing correlation ID or event type", properties.MessageId);
            return "The message has no correlation ID or event type.";
        }

        if (earlierDeliveries > _options.DeliveryLimit)
        {
            _logger.LogWarning("Rejecting message {MessageId}: redelivered {Count} times, over the limit of {Limit}", properties.MessageId, earlierDeliveries, _options.DeliveryLimit);
            return $"The message was delivered {earlierDeliveries} times, over the limit of {_options.DeliveryLimit}.";
        }

        return null;
    }

    private static int? ReadInt(IDictionary<string, object?>? headers, string name)
    {
        return headers is not null && headers.TryGetValue(name, out var value) && value is int or long or short or byte
            ? Convert.ToInt32(value, System.Globalization.CultureInfo.InvariantCulture)
            : null;
    }
}
