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

public interface IStaleRequestSweeper
{
    /// <summary>
    /// Marks requests that did not finish within the queue's message lifetime (plus a grace period) as Failed: their message expired or was
    /// dead-lettered, or their retries ran past the lifetime. A request a worker currently holds is left alone. Returns how many it marked.
    /// </summary>
    Task<int> SweepAsync(CancellationToken cancellationToken);
}
