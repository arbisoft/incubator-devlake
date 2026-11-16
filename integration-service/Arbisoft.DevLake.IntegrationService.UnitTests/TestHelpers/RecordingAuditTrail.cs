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

namespace Arbisoft.DevLake.IntegrationService.UnitTests.TestHelpers;

/// <summary>An audit trail that keeps what it is asked to record, so a test can check each entry a service writes.</summary>
public sealed class RecordingAuditTrail : IAuditTrail
{
    public List<(AuditActor Actor, AuditEntry Entry)> Recorded { get; } = [];

    /// <summary>The only entry recorded; fails the test when there is none or more than one.</summary>
    public AuditEntry OnlyEntry => Assert.Single(Recorded).Entry;

    public Task RecordAsync(AuditActor actor, AuditEntry entry, CancellationToken cancellationToken)
    {
        Recorded.Add((actor, entry));
        return Task.CompletedTask;
    }
}
