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

public interface IReceivedRequestRelay
{
    /// <summary>
    /// Publishes again the requests the API recorded but never marked Queued, because the process stopped or the database failed between the
    /// commit and the publish (the outbox relay). Only requests older than <see cref="ProcessingOptions.RepublishAfterSeconds"/> are touched, so an
    /// intake still publishing is left alone. Stops at the first refusal from the broker. Returns how many it published.
    /// </summary>
    Task<int> RelayAsync(CancellationToken cancellationToken);
}
