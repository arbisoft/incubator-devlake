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

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Processing;

/// <summary>
/// Moves one request one step forward: collects its stats if they are not stored yet, then makes one delivery attempt, and leaves it finished or
/// deferred to its next attempt in the database. It never waits between attempts.
/// </summary>
public interface IRequestWorker
{
    /// <summary>
    /// Handles a message taken off the queue. Once the request is claimed the database owns it, so the message is acknowledged whatever happens
    /// to the request; a message the request is not found for, or that the consumer rejected, is dead-lettered.
    /// </summary>
    Task<WorkResult> HandleMessageAsync(QueueDelivery delivery, ProcessingRun run, CancellationToken stopping);

    /// <summary>Handles a request the database says is due: deferred until now, or left by a worker that stopped.</summary>
    Task<StepResult> HandleDueAsync(RequestLog request, ProcessingRun run, CancellationToken stopping);
}
