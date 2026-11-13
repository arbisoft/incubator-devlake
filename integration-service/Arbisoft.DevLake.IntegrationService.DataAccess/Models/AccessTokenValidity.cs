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

namespace Arbisoft.DevLake.IntegrationService.DataAccess.Models;

/// <summary>
/// What decides whether an issued token may still be used, read in one query on every authenticated request: the token's own revocation, its
/// client's active flag and the revocation of the secret it was issued with.
/// </summary>
public sealed class AccessTokenValidity
{
    public long ClientRefId { get; init; }
    public DateTimeOffset? TokenRevokedOn { get; init; }

    /// <summary>Null when the client row no longer exists.</summary>
    public bool? ClientIsActive { get; init; }

    /// <summary>
    /// When the secret the token was issued with was revoked. Checking it here closes the gap where a token is issued while its secret is being
    /// revoked and so misses the bulk revocation of that secret's tokens.
    /// </summary>
    public DateTimeOffset? SecretRevokedOn { get; init; }

    /// <summary>Null when the secret row no longer exists.</summary>
    public long? SecretId { get; init; }
}
