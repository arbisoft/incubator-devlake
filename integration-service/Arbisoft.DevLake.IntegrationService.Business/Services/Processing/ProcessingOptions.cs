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

using System.ComponentModel.DataAnnotations;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Processing;

/// <summary>Settings for the background job that takes stats requests off the queue and delivers their results.</summary>
public sealed class ProcessingOptions
{
    public const string SectionName = "Processing";

    /// <summary>Turns the job off, for a host that should only accept requests (or while investigating a problem). Requests stay queued.</summary>
    public bool Enabled { get; init; } = true;

    /// <summary>How often the job looks at the queue.</summary>
    [Range(1, 3600)]
    public int IntervalSeconds { get; init; } = 30;

    /// <summary>The most requests processed at the same time in one run (ASY-5). DevLake is separately capped by <c>DevLake:MaxConcurrentRequests</c>.</summary>
    [Range(1, 32)]
    public int MaxParallelRequests { get; init; } = 4;

    /// <summary>The wait before the second attempt to deliver to Sophia. Each further wait doubles, up to <see cref="MaxDeliveryRetryDelaySeconds"/>.</summary>
    [Range(1, 3600)]
    public int DeliveryRetryDelaySeconds { get; init; } = 30;

    /// <summary>
    /// The longest wait between two delivery attempts. With the defaults (30 s doubling, capped at 15 minutes) ten attempts fit inside the two hours a
    /// request may live.
    /// </summary>
    [Range(1, 3600)]
    public int MaxDeliveryRetryDelaySeconds { get; init; } = 900;

    /// <summary>How long a request waits before it is tried again when DevLake was down or its client's credentials were refused.</summary>
    [Range(1, 3600)]
    public int UnavailableRetryDelaySeconds { get; init; } = 60;

    /// <summary>
    /// How long a worker holds a request it is working on. Another worker can take the request only after this runs out, which is how a request
    /// whose worker stopped (a crash) is picked up again. It must be longer than one step of work: collecting from DevLake and one delivery attempt.
    /// </summary>
    [Range(30, 7200)]
    public int ClaimLeaseSeconds { get; init; } = 600;

    /// <summary>How long one run keeps taking new work. Work already started finishes; the next run carries on.</summary>
    [Range(1, 3600)]
    public int RunBudgetSeconds { get; init; } = 120;

    /// <summary>
    /// How old a request still marked Received must be before the job publishes it again, because its intake never finished publishing it. It must
    /// be more than twice <c>RabbitMq:PublishTimeoutSeconds</c>, so an intake that is still publishing is never overtaken.
    /// </summary>
    [Range(1, 3600)]
    public int RepublishAfterSeconds { get; init; } = 60;

    /// <summary>How long past the queue's message lifetime a request may stay unfinished before it is marked failed.</summary>
    [Range(0, 3600)]
    public int StaleGraceSeconds { get; init; } = 60;
}
