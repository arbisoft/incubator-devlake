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

namespace Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;

/// <summary>The columns the request log list can be sorted by. Only these are ever put in the ORDER BY, never text from the caller.</summary>
public enum RequestLogSortColumn
{
    CreatedOn,
    ModifiedOn,
    EventType,
    Status,
    CorrelationId
}

/// <summary>How the request log list is ordered. Ties are broken by the row ID in the same direction, so a page never repeats or skips a row.</summary>
public sealed record RequestLogSort(RequestLogSortColumn Column = RequestLogSortColumn.CreatedOn, bool Descending = true);
