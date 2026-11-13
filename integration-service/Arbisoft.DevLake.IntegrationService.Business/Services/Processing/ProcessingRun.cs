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

using System.Collections.Concurrent;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Processing;

/// <summary>
/// What the workers of one run share: when the run stops taking new work, why it stopped early if it did, and which clients' credentials were
/// refused during the run. Safe to use from parallel workers.
/// </summary>
public sealed class ProcessingRun
{
    private readonly ConcurrentDictionary<long, bool> _failingClients = new();
    private readonly DateTimeOffset _takeWorkUntil;
    private readonly TimeProvider _timeProvider;
    private string? _haltReason;

    public ProcessingRun(DateTimeOffset takeWorkUntil, TimeProvider timeProvider)
    {
        _takeWorkUntil = takeWorkUntil;
        _timeProvider = timeProvider;
    }

    /// <summary>Why the run stopped taking work early (DevLake failing in the middle of it), or null.</summary>
    public string? HaltReason => Volatile.Read(ref _haltReason);

    /// <summary>True while the run may take more work: it has not been halted and its time budget is not used up.</summary>
    public bool MayTakeWork => HaltReason is null && _timeProvider.GetUtcNow() < _takeWorkUntil;

    /// <summary>Stops the run taking new work, because something every request needs (DevLake) is failing. The first reason given is kept.</summary>
    public void Halt(string reason) => Interlocked.CompareExchange(ref _haltReason, reason, null);

    /// <summary>Records that a client's credentials were refused, so the run defers that client's other requests without calling Sophia again.</summary>
    public void MarkClientFailing(long clientRefId) => _failingClients[clientRefId] = true;

    public bool IsClientFailing(long clientRefId) => _failingClients.ContainsKey(clientRefId);
}
