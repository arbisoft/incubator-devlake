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

using Arbisoft.DevLake.IntegrationService.DataAccess.Models;

namespace Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;

/// <summary>The request log aggregate: the log row, its JSON body and its delivery attempts.</summary>
public interface IRequestLogRepository
{
    Task<long> InsertAsync(RequestLog requestLog, CancellationToken cancellationToken);

    /// <summary>
    /// Inserts a request that carries an idempotency key. Returns null, and inserts nothing, when another request already holds that key,
    /// which is how the database stops two identical requests racing past an application-level check.
    /// </summary>
    Task<long?> TryInsertAsync(RequestLog requestLog, CancellationToken cancellationToken);

    /// <summary>The request that currently holds an idempotency key, or null.</summary>
    Task<RequestLog?> GetByIdempotencyKeyAsync(string idempotencyKey, CancellationToken cancellationToken);

    /// <summary>
    /// Frees the idempotency key held by one specific request so an identical request can be queued again. It targets the row, not the key,
    /// so it can never clear a newer request that has since taken the key.
    /// </summary>
    Task ReleaseIdempotencyKeyAsync(long requestLogId, CancellationToken cancellationToken);

    Task<long> InsertJsonAsync(RequestLogJson json, CancellationToken cancellationToken);

    Task<RequestLog?> GetByCorrelationIdAsync(string correlationId, CancellationToken cancellationToken);

    Task<RequestLog?> GetByIdAsync(long id, CancellationToken cancellationToken);

    /// <summary>The JSON body of a request log, or null when it has none.</summary>
    Task<string?> GetJsonAsync(long requestLogId, CancellationToken cancellationToken);

    /// <summary>Sets the status and clears any deferral and lease, for a request that is finished or handed back to the queue.</summary>
    Task<bool> UpdateStatusAsync(long id, string status, CancellationToken cancellationToken);

    /// <summary>
    /// Claims a request for <paramref name="leaseUntil"/>, setting it Processing. It succeeds only if the request is Received, Queued or Processing,
    /// nobody holds an unexpired lease on it, and it is not deferred past <paramref name="now"/>, so of two workers trying at once exactly one wins.
    /// </summary>
    Task<bool> TryClaimAsync(long id, DateTimeOffset now, DateTimeOffset leaseUntil, CancellationToken cancellationToken);

    /// <summary>Releases the lease and defers the request to <paramref name="nextAttemptOn"/> with the given status.</summary>
    Task DeferAsync(long id, string status, DateTimeOffset nextAttemptOn, CancellationToken cancellationToken);

    /// <summary>
    /// Requests the database owns that can be claimed now, soonest due first: deferred requests whose time has come, and requests whose lease ran
    /// out because their worker stopped. New requests still waiting in the queue are not included. Only requests that entered processing
    /// (<see cref="RequestLog.QueuedOn"/>) at or after <paramref name="queuedSince"/> are listed; older ones are left to expire.
    /// </summary>
    Task<IReadOnlyList<RequestLog>> ListDueAsync(DateTimeOffset now, DateTimeOffset queuedSince, int limit, CancellationToken cancellationToken);

    /// <summary>
    /// Puts a Failed request back into processing: Queued, due at <paramref name="now"/>, with a fresh lifetime from <paramref name="now"/>.
    /// Returns false when the request is not Failed (any more).
    /// </summary>
    Task<bool> TryRetryAsync(long id, DateTimeOffset now, CancellationToken cancellationToken);

    /// <summary>Stores the collected callback body of a request, replacing any stored before.</summary>
    Task SavePayloadAsync(long requestLogId, string payload, DateTimeOffset createdOn, CancellationToken cancellationToken);

    /// <summary>The stored callback body of a request, or null.</summary>
    Task<string?> GetPayloadAsync(long requestLogId, CancellationToken cancellationToken);

    /// <summary>Deletes the stored callback body of a finished request.</summary>
    Task DeletePayloadAsync(long requestLogId, CancellationToken cancellationToken);

    /// <summary>
    /// Changes the status to <paramref name="newStatus"/> only if it is still <paramref name="expectedStatus"/>. Returns false when something else changed it first, for example the
    /// processing job picking up the message before the API marked the request queued.
    /// </summary>
    Task<bool> TryChangeStatusAsync(long id, string expectedStatus, string newStatus, CancellationToken cancellationToken);

    /// <summary>Requests in <paramref name="status"/> created at or after <paramref name="createdFrom"/> and before <paramref name="createdBefore"/>, oldest first.</summary>
    Task<IReadOnlyList<RequestLog>> ListByStatusCreatedBetweenAsync(
        string status, DateTimeOffset createdFrom, DateTimeOffset createdBefore, int limit, CancellationToken cancellationToken);

    /// <summary>Requests with the given status created at or after <paramref name="since"/>, oldest first, at most <paramref name="limit"/>.</summary>
    Task<IReadOnlyList<RequestLog>> ListByStatusSinceAsync(string status, DateTimeOffset since, int limit, CancellationToken cancellationToken);

    /// <summary>
    /// Requests in any of the given statuses that entered processing (<see cref="RequestLog.QueuedOn"/>) before <paramref name="queuedBefore"/>
    /// and that nobody holds a lease on at <paramref name="now"/>, oldest first, at most <paramref name="limit"/>.
    /// </summary>
    Task<IReadOnlyList<RequestLog>> ListStaleAsync(
        IReadOnlyCollection<string> statuses, DateTimeOffset queuedBefore, DateTimeOffset now, int limit, CancellationToken cancellationToken);

    Task<PagedResult<RequestLog>> ListAsync(RequestLogFilter filter, int page, int pageSize, CancellationToken cancellationToken);

    Task<long> InsertAttemptAsync(RequestResponseAttempt attempt, CancellationToken cancellationToken);

    Task<IReadOnlyList<RequestResponseAttempt>> GetAttemptsAsync(long requestLogId, CancellationToken cancellationToken);
}
