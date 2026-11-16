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

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Audit;

/// <summary>The actions the audit trail records.</summary>
public static class AuditActions
{
    public const string Created = "Created";
    public const string Updated = "Updated";
    public const string Revoked = "Revoked";
    public const string Rotated = "Rotated";
    public const string Retried = "Retried";
    public const string ScopesChanged = "ScopesChanged";
    public const string AccessChanged = "AccessChanged";
    public const string StatusChanged = "StatusChanged";
    public const string SignedIn = "SignedIn";
    public const string SignInRefused = "SignInRefused";
    public const string SignedOut = "SignedOut";
    public const string PasswordChanged = "PasswordChanged";
    public const string TokenIssued = "TokenIssued";
    public const string TokenRefused = "TokenRefused";
}
