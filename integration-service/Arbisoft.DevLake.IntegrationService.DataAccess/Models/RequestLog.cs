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

namespace Arbisoft.DevLake.IntegrationService.DataAccess.Models;

/// <summary>A request received from a client and its current status.</summary>
public sealed class RequestLog
{
    public long Id { get; init; }
    public long ClientRefId { get; init; }
    public string CorrelationId { get; init; } = string.Empty;
    public string Url { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public string EventType { get; init; } = string.Empty;
    public DateTimeOffset CreatedOn { get; init; }

    /// <summary>When the row was last changed (status, claim, deferral, retry). Null until it is first changed after being received.</summary>
    public DateTimeOffset? ModifiedOn { get; init; }

    /// <summary>When the request last entered processing: when it was received, or when it was retried after failing. Null on insert means CreatedOn.</summary>
    public DateTimeOffset? QueuedOn { get; init; }
    public string? IdempotencyKey { get; init; }

    /// <summary>When a deferred request is next due. Null while the request is new, being worked on, or finished.</summary>
    public DateTimeOffset? NextAttemptOn { get; init; }

    /// <summary>Until when a worker holds the request. Null when nobody does.</summary>
    public DateTimeOffset? ClaimedUntil { get; init; }
}
