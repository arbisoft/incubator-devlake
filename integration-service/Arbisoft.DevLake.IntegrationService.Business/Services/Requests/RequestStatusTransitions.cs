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

using Arbisoft.DevLake.IntegrationService.Business.Services.Audit;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Persistence;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Requests;

/// <summary>
/// Every status change the service makes to a request, each with its audit entry. A change runs in its own transaction: it locks the row, reads
/// the status it starts from, makes the change and, when the status really changed, records it as done by the service itself. A change that keeps
/// the status, such as a deferral that stays Processing, is saved but not recorded. An administrator's retry is recorded by the request log service.
/// </summary>
public interface IRequestStatusTransitions
{
    /// <summary>Records a request the API has just inserted as created by the client that sent it, on the caller's open transaction.</summary>
    Task RecordCreatedAsync(RequestKey request, string status, string clientId, CancellationToken cancellationToken);

    /// <summary>Moves the request to the change's status only if it is still <paramref name="expected"/>. False, with nothing recorded, otherwise.</summary>
    Task<bool> TryChangeAsync(RequestKey request, string expected, StatusChange change, CancellationToken cancellationToken);

    /// <summary>Sets the status and clears any deferral and lease, for a request that is finished.</summary>
    Task SetAsync(RequestKey request, StatusChange change, CancellationToken cancellationToken);

    /// <summary>Sets the status and the time the request is next due.</summary>
    Task DeferAsync(RequestKey request, StatusChange change, DateTimeOffset nextAttemptOn, CancellationToken cancellationToken);

    /// <summary>Claims the request for the processing job until <paramref name="leaseUntil"/>. False when another worker holds it or it is not due.</summary>
    Task<bool> TryClaimAsync(RequestKey request, DateTimeOffset now, DateTimeOffset leaseUntil, CancellationToken cancellationToken);
}

public sealed class RequestStatusTransitions : IRequestStatusTransitions
{
    private readonly IRequestLogRepository _requestLogs;
    private readonly IAuditTrail _audit;
    private readonly IDbSession _session;

    public RequestStatusTransitions(IRequestLogRepository requestLogs, IAuditTrail audit, IDbSession session)
    {
        _requestLogs = requestLogs;
        _audit = audit;
        _session = session;
    }

    public Task RecordCreatedAsync(RequestKey request, string status, string clientId, CancellationToken cancellationToken)
    {
        return _audit.RecordAsync(AuditActor.Client(clientId), Subject(request).Did(AuditActions.Created, [new AuditChange(AuditedFields.Status, null, status)]), cancellationToken);
    }

    public Task<bool> TryChangeAsync(RequestKey request, string expected, StatusChange change, CancellationToken cancellationToken)
    {
        return _audit.SaveChangeAsync(
            _session,
            AuditActor.System,
            async () => await _requestLogs.TryChangeStatusAsync(request.Id, expected, change.To, cancellationToken) ? Entry(request, expected, change) : null,
            cancellationToken);
    }

    public Task SetAsync(RequestKey request, StatusChange change, CancellationToken cancellationToken)
    {
        return ChangeAsync(request, change, () => _requestLogs.UpdateStatusAsync(request.Id, change.To, cancellationToken), cancellationToken);
    }

    public Task DeferAsync(RequestKey request, StatusChange change, DateTimeOffset nextAttemptOn, CancellationToken cancellationToken)
    {
        return ChangeAsync(request, change, () => _requestLogs.DeferAsync(request.Id, change.To, nextAttemptOn, cancellationToken), cancellationToken);
    }

    public Task<bool> TryClaimAsync(RequestKey request, DateTimeOffset now, DateTimeOffset leaseUntil, CancellationToken cancellationToken)
    {
        return _session.InTransactionAsync(
            async () =>
            {
                var from = await _requestLogs.GetStatusForUpdateAsync(request.Id, cancellationToken);
                if (from is null || !await _requestLogs.TryClaimAsync(request.Id, now, leaseUntil, cancellationToken))
                {
                    return false;
                }

                await RecordIfChangedAsync(request, from, new StatusChange(RequestStatus.Processing, StatusReasons.Claimed), cancellationToken);
                return true;
            },
            cancellationToken);
    }

    /// <summary>Makes an unconditional change, which is kept even when the status stays the same (it also moves the lease or the due time).</summary>
    private Task<bool> ChangeAsync(RequestKey request, StatusChange change, Func<Task> update, CancellationToken cancellationToken)
    {
        return _session.InTransactionAsync(
            async () =>
            {
                var from = await _requestLogs.GetStatusForUpdateAsync(request.Id, cancellationToken);
                await update();
                if (from is not null)
                {
                    await RecordIfChangedAsync(request, from, change, cancellationToken);
                }

                return true;
            },
            cancellationToken);
    }

    private async Task RecordIfChangedAsync(RequestKey request, string from, StatusChange change, CancellationToken cancellationToken)
    {
        if (Entry(request, from, change) is { } entry)
        {
            await _audit.RecordAsync(AuditActor.System, entry, cancellationToken);
        }
    }

    private static AuditEntry? Entry(RequestKey request, string from, StatusChange change) =>
        string.Equals(from, change.To, StringComparison.Ordinal)
            ? null
            : Subject(request).Did(AuditActions.StatusChanged, [new AuditChange(AuditedFields.Status, from, change.To)], change.Reason);

    private static AuditSubject Subject(RequestKey request) => new(AuditEntityTypes.Request, AuditValue.Id(request.Id), request.CorrelationId);
}
