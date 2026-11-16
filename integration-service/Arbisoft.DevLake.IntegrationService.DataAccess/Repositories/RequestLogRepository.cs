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
using Arbisoft.DevLake.IntegrationService.DataAccess.Options;
using Arbisoft.DevLake.IntegrationService.DataAccess.Persistence;
using Microsoft.Extensions.Options;
using MySqlConnector;

namespace Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;

public sealed class RequestLogRepository : RepositoryBase, IRequestLogRepository
{
    private const string Columns = "id, clientRefId, correlationId, url, status, eventType, createdOn, modifiedOn, queuedOn, idempotencyKey, nextAttemptOn, claimedUntil";

    /// <summary>Not claimed by anybody (or the claim ran out) and not deferred to later. Uses @now.</summary>
    private const string Claimable =
        "status IN ('" + RequestStatus.Received + "', '" + RequestStatus.Queued + "', '" + RequestStatus.Processing + "') " +
        "AND (claimedUntil IS NULL OR claimedUntil < @now) AND (nextAttemptOn IS NULL OR nextAttemptOn <= @now)";
    private const string IdempotencyIndex = "UX_RequestLogs_idempotencyKey";
    private const string AttemptColumns = "id, requestLogId, responseJson, requestJson, attemptStatus, failureError, attemptBy, attemptOn";

    public RequestLogRepository(IDbSession session, IOptions<DatabaseOptions> options)
        : base(session, options)
    {
    }

    public Task<long> InsertAsync(RequestLog requestLog, CancellationToken cancellationToken)
    {
        return InsertAsync(
            "INSERT INTO RequestLogs (clientRefId, correlationId, url, status, eventType, createdOn, queuedOn, idempotencyKey) " +
            "VALUES (@ClientRefId, @CorrelationId, @Url, @Status, @EventType, @CreatedOn, COALESCE(@QueuedOn, @CreatedOn), @IdempotencyKey)",
            requestLog,
            cancellationToken);
    }

    public async Task<long?> TryInsertAsync(RequestLog requestLog, CancellationToken cancellationToken)
    {
        try
        {
            return await InsertAsync(requestLog, cancellationToken);
        }
        catch (MySqlException exception) when (exception.ErrorCode == MySqlErrorCode.DuplicateKeyEntry && exception.Message.Contains(IdempotencyIndex, StringComparison.Ordinal))
        {
            return null;
        }
    }

    public Task<RequestLog?> GetByIdempotencyKeyAsync(string idempotencyKey, CancellationToken cancellationToken)
    {
        return QuerySingleOrDefaultAsync<RequestLog>($"SELECT {Columns} FROM RequestLogs WHERE idempotencyKey = @idempotencyKey", new { idempotencyKey }, cancellationToken);
    }

    public async Task ReleaseIdempotencyKeyAsync(long requestLogId, CancellationToken cancellationToken)
    {
        await ExecuteAsync("UPDATE RequestLogs SET idempotencyKey = NULL, modifiedOn = UTC_TIMESTAMP(6) WHERE id = @requestLogId", new { requestLogId }, cancellationToken);
    }

    public Task<long> InsertJsonAsync(RequestLogJson json, CancellationToken cancellationToken)
    {
        return InsertAsync("INSERT INTO RequestLogJsons (requestLogId, json) VALUES (@RequestLogId, @Json)", json, cancellationToken);
    }

    public Task<RequestLog?> GetByCorrelationIdAsync(string correlationId, CancellationToken cancellationToken)
    {
        return QuerySingleOrDefaultAsync<RequestLog>($"SELECT {Columns} FROM RequestLogs WHERE correlationId = @correlationId", new { correlationId }, cancellationToken);
    }

    public Task<RequestLog?> GetByIdAsync(long id, CancellationToken cancellationToken)
    {
        return QuerySingleOrDefaultAsync<RequestLog>($"SELECT {Columns} FROM RequestLogs WHERE id = @id", new { id }, cancellationToken);
    }

    public Task<string?> GetJsonAsync(long requestLogId, CancellationToken cancellationToken)
    {
        return QuerySingleOrDefaultAsync<string>("SELECT json FROM RequestLogJsons WHERE requestLogId = @requestLogId ORDER BY id LIMIT 1", new { requestLogId }, cancellationToken);
    }

    public async Task<bool> UpdateStatusAsync(long id, string status, CancellationToken cancellationToken)
    {
        var changed = await ExecuteAsync(
            "UPDATE RequestLogs SET status = @status, nextAttemptOn = NULL, claimedUntil = NULL, modifiedOn = UTC_TIMESTAMP(6) WHERE id = @id", new { id, status }, cancellationToken);
        return changed > 0;
    }

    public async Task<bool> TryClaimAsync(long id, DateTimeOffset now, DateTimeOffset leaseUntil, CancellationToken cancellationToken)
    {
        var changed = await ExecuteAsync(
            "UPDATE RequestLogs SET status = '" + RequestStatus.Processing + "', claimedUntil = @leaseUntil, nextAttemptOn = NULL, modifiedOn = UTC_TIMESTAMP(6) WHERE id = @id AND " + Claimable,
            new { id, now, leaseUntil },
            cancellationToken);
        return changed > 0;
    }

    public async Task<bool> TryRetryAsync(long id, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var changed = await ExecuteAsync(
            "UPDATE RequestLogs SET status = '" + RequestStatus.Queued + "', queuedOn = @now, nextAttemptOn = @now, claimedUntil = NULL, modifiedOn = @now " +
            "WHERE id = @id AND status = '" + RequestStatus.Failed + "'",
            new { id, now },
            cancellationToken);
        return changed > 0;
    }

    public async Task DeferAsync(long id, string status, DateTimeOffset nextAttemptOn, CancellationToken cancellationToken)
    {
        await ExecuteAsync(
            "UPDATE RequestLogs SET status = @status, nextAttemptOn = @nextAttemptOn, claimedUntil = NULL, modifiedOn = UTC_TIMESTAMP(6) WHERE id = @id", new { id, status, nextAttemptOn }, cancellationToken);
    }

    public Task<IReadOnlyList<RequestLog>> ListDueAsync(DateTimeOffset now, DateTimeOffset queuedSince, int limit, CancellationToken cancellationToken)
    {
        // A request with neither a deferral nor a lease that is still Received or Queued is new: its message is in the queue, which owns it.
        return QueryAsync<RequestLog>(
            $"SELECT {Columns} FROM RequestLogs WHERE {Claimable} AND (nextAttemptOn IS NOT NULL OR status = '{RequestStatus.Processing}') " +
            "AND queuedOn >= @queuedSince ORDER BY COALESCE(nextAttemptOn, claimedUntil, queuedOn), id LIMIT @limit",
            new { now, queuedSince, limit },
            cancellationToken);
    }

    public async Task SavePayloadAsync(long requestLogId, string payload, DateTimeOffset createdOn, CancellationToken cancellationToken)
    {
        await ExecuteAsync(
            "INSERT INTO RequestPayloads (requestLogId, payload, createdOn) VALUES (@requestLogId, @payload, @createdOn) " +
            "ON DUPLICATE KEY UPDATE payload = VALUES(payload), createdOn = VALUES(createdOn)",
            new { requestLogId, payload, createdOn },
            cancellationToken);
    }

    public Task<string?> GetPayloadAsync(long requestLogId, CancellationToken cancellationToken)
    {
        return QuerySingleOrDefaultAsync<string>("SELECT payload FROM RequestPayloads WHERE requestLogId = @requestLogId", new { requestLogId }, cancellationToken);
    }

    public async Task DeletePayloadAsync(long requestLogId, CancellationToken cancellationToken)
    {
        await ExecuteAsync("DELETE FROM RequestPayloads WHERE requestLogId = @requestLogId", new { requestLogId }, cancellationToken);
    }

    public async Task<bool> TryChangeStatusAsync(long id, string expectedStatus, string newStatus, CancellationToken cancellationToken)
    {
        var changed = await ExecuteAsync(
            "UPDATE RequestLogs SET status = @newStatus, modifiedOn = UTC_TIMESTAMP(6) WHERE id = @id AND status = @expectedStatus", new { id, expectedStatus, newStatus }, cancellationToken);
        return changed > 0;
    }

    public Task<IReadOnlyList<RequestLog>> ListByStatusCreatedBetweenAsync(
        string status, DateTimeOffset createdFrom, DateTimeOffset createdBefore, int limit, CancellationToken cancellationToken)
    {
        return QueryAsync<RequestLog>(
            $"SELECT {Columns} FROM RequestLogs WHERE status = @status AND createdOn >= @createdFrom AND createdOn < @createdBefore ORDER BY createdOn, id LIMIT @limit",
            new { status, createdFrom, createdBefore, limit },
            cancellationToken);
    }

    public Task<IReadOnlyList<RequestLog>> ListByStatusSinceAsync(string status, DateTimeOffset since, int limit, CancellationToken cancellationToken)
    {
        return QueryAsync<RequestLog>(
            $"SELECT {Columns} FROM RequestLogs WHERE status = @status AND createdOn >= @since ORDER BY createdOn, id LIMIT @limit",
            new { status, since, limit },
            cancellationToken);
    }

    public Task<IReadOnlyList<RequestLog>> ListStaleAsync(
        IReadOnlyCollection<string> statuses, DateTimeOffset queuedBefore, DateTimeOffset now, int limit, CancellationToken cancellationToken)
    {
        return QueryAsync<RequestLog>(
            $"SELECT {Columns} FROM RequestLogs WHERE status IN @statuses AND queuedOn < @queuedBefore AND (claimedUntil IS NULL OR claimedUntil < @now) " +
            "ORDER BY queuedOn, id LIMIT @limit",
            new { statuses, queuedBefore, now, limit },
            cancellationToken);
    }

    public Task<PagedResult<RequestLog>> ListAsync(RequestLogFilter filter, int page, int pageSize, CancellationToken cancellationToken, RequestLogSort? sort = null)
    {
        const string fromAndWhere =
            "FROM RequestLogs WHERE (@ClientRefId IS NULL OR clientRefId = @ClientRefId) AND (@Status IS NULL OR status = @Status) " +
            "AND (@From IS NULL OR createdOn >= @From) AND (@To IS NULL OR createdOn < @To)";
        return QueryPageAsync<RequestLog>(Columns, fromAndWhere, OrderBy(sort ?? new RequestLogSort()), filter, page, pageSize, cancellationToken);
    }

    private static string OrderBy(RequestLogSort sort)
    {
        var column = sort.Column switch
        {
            RequestLogSortColumn.ModifiedOn => "modifiedOn",
            RequestLogSortColumn.EventType => "eventType",
            RequestLogSortColumn.Status => "status",
            RequestLogSortColumn.CorrelationId => "correlationId",
            _ => "createdOn"
        };
        var direction = sort.Descending ? "DESC" : "ASC";
        return $"{column} {direction}, id {direction}";
    }

    public Task<long> InsertAttemptAsync(RequestResponseAttempt attempt, CancellationToken cancellationToken)
    {
        return InsertAsync(
            "INSERT INTO RequestResponseAttempts (requestLogId, responseJson, requestJson, attemptStatus, failureError, attemptBy, attemptOn) " +
            "VALUES (@RequestLogId, @ResponseJson, @RequestJson, @AttemptStatus, @FailureError, @AttemptBy, @AttemptOn)",
            attempt,
            cancellationToken);
    }

    public Task<IReadOnlyList<RequestResponseAttempt>> GetAttemptsAsync(long requestLogId, CancellationToken cancellationToken)
    {
        return QueryAsync<RequestResponseAttempt>($"SELECT {AttemptColumns} FROM RequestResponseAttempts WHERE requestLogId = @requestLogId ORDER BY attemptOn, id", new { requestLogId }, cancellationToken);
    }
}
