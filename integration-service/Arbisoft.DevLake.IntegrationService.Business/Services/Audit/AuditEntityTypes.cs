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

/// <summary>
/// The kinds of object an audit entry can be about. A part of an object is recorded against the object, so its history is complete: a client's
/// secrets against the client, and a callback URL against its outbound config, which is identified by the client's id.
/// </summary>
public static class AuditEntityTypes
{
    public const string Client = "Client";
    public const string ClientConfig = "ClientConfig";
    public const string Scope = "Scope";
    public const string EmailMapping = "EmailMapping";
    public const string SigningKey = "SigningKey";
    public const string AccessToken = "AccessToken";
    public const string UpstreamToken = "UpstreamToken";
    public const string PortalUser = "PortalUser";
    public const string Request = "Request";
}
