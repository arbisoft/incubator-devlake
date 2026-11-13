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

using Arbisoft.DevLake.IntegrationService.Business.Dtos.Stats;
using Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis.DevLake;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Processing;

public interface IEngineerStatsCollector
{
    /// <summary>
    /// Gets Jira, GitHub, AI usage and AI cost stats from DevLake for an engineer's Arbisoft email and for every other email they commit with,
    /// all at once, and merges them into one result. A call DevLake refuses (a 4xx, or an answer that is not JSON) is recorded in the result's
    /// errors and the rest is kept, so one bad email does not throw away the engineer's other stats. DevLake refusing our credentials or being
    /// unreachable is not the engineer's problem: it fails the whole collection, so the request waits and is collected in full later.
    /// It makes HTTP calls only and never touches the database, so many engineers can be collected in parallel without sharing a connection (DAT-16).
    /// </summary>
    /// <param name="arbisoftEmail">The engineer's Arbisoft email.</param>
    /// <param name="mappedEmails">The other emails they commit with, as stored. They are canonicalized and de-duplicated here.</param>
    /// <param name="query">The period to ask for.</param>
    /// <param name="correlationId">The request's correlation ID, sent with every call.</param>
    /// <param name="cancellationToken">Cancels the collection.</param>
    /// <exception cref="DataAccess.ExternalApis.ExternalAuthenticationException">DevLake refused our credentials.</exception>
    /// <exception cref="DataAccess.ExternalApis.ExternalApiUnavailableException">DevLake could not be reached or kept failing.</exception>
    Task<EmployeeStatsDto> CollectAsync(string arbisoftEmail, IReadOnlyList<string> mappedEmails, StatsQuery query, string correlationId, CancellationToken cancellationToken);
}
