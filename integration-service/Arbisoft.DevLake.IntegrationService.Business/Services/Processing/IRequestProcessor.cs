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

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Processing;

/// <summary>What one processing run did, for the log.</summary>
/// <param name="MessagesTaken">Messages taken off the queue.</param>
/// <param name="Resumed">Requests the database had waiting (deferred or left by a stopped worker) that were picked up again.</param>
/// <param name="Finished">Requests that ended Success, Failed or Revoked.</param>
/// <param name="Deferred">Requests left waiting in the database for their next attempt.</param>
/// <param name="DeadLettered">Messages moved to the dead-letter queue.</param>
/// <param name="Requeued">Messages put back on the queue because something went wrong before their request was taken.</param>
/// <param name="Expired">Requests marked Failed because they outlived the request lifetime.</param>
/// <param name="Republished">Requests recorded by the API but never queued, published again.</param>
/// <param name="HaltReason">Why the run did not take work, or stopped taking it early.</param>
public sealed record ProcessingRunSummary(
    int MessagesTaken = 0,
    int Resumed = 0,
    int Finished = 0,
    int Deferred = 0,
    int DeadLettered = 0,
    int Requeued = 0,
    int Expired = 0,
    int Republished = 0,
    string? HaltReason = null)
{
    public bool DidWork => MessagesTaken > 0 || Resumed > 0 || Expired > 0 || Republished > 0 || HaltReason is not null;
}

public interface IRequestProcessor
{
    /// <summary>
    /// One run: marks expired requests failed, republishes requests that were recorded but never queued, and, if there is work and DevLake is
    /// usable, takes work one item per free worker (at most <see cref="ProcessingOptions.MaxParallelRequests"/> at a time): first the requests the
    /// database has due, then messages from the queue, until there is none left, the run's time budget is used, or DevLake fails. Each item is one
    /// step of work that ends with its request finished or deferred, so nothing is held in memory or in the queue between attempts.
    /// </summary>
    Task<ProcessingRunSummary> ProcessPendingAsync(CancellationToken cancellationToken);
}
