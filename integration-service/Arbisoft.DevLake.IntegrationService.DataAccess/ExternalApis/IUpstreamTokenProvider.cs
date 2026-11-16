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


namespace Arbisoft.DevLake.IntegrationService.DataAccess.ExternalApis;

/// <summary>The API tokens this service uses to call DevLake and Workstream, which an administrator enters in the admin portal.</summary>
public interface IUpstreamTokenProvider
{
    /// <summary>The system's token, decrypted from the database and cached for a short while.</summary>
    /// <exception cref="ExternalAuthenticationException">No token is set for the system, or the stored one cannot be decrypted.</exception>
    Task<string> GetAsync(UpstreamSystem system, CancellationToken cancellationToken);

    /// <summary>Forgets the cached token, so the next call reads the one just saved.</summary>
    void Invalidate(UpstreamSystem system);
}
