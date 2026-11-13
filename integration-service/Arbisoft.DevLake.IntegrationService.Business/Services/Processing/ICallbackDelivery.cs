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

using Arbisoft.DevLake.IntegrationService.DataAccess.Models;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Processing;

/// <summary>How one delivery attempt went.</summary>
public enum DeliveryOutcome
{
    /// <summary>The client's callback accepted the result.</summary>
    Delivered,

    /// <summary>The client has no active callback for the request any more.</summary>
    Revoked,

    /// <summary>The client's callback or token endpoint refused our credentials. This is the client's problem, not the request's, and is not counted as an attempt.</summary>
    CredentialsRefused,

    /// <summary>The callback could not be reached or did not accept the result. Counted towards the client's maxAttempts.</summary>
    Failed
}

/// <summary>The result of one delivery attempt.</summary>
/// <param name="Outcome">How it went.</param>
/// <param name="FailedAttempts">How many counted attempts have failed so far, this one included.</param>
/// <param name="AttemptsUsedUp">True when the client's maxAttempts is reached, so the request must end Failed.</param>
public sealed record DeliveryAttempt(DeliveryOutcome Outcome, int FailedAttempts = 0, bool AttemptsUsedUp = false);

public interface ICallbackDelivery
{
    /// <summary>
    /// Makes one attempt to post a request's result to the client's callback and records it, unless the client's maxAttempts is already used up.
    /// It never waits between attempts: the caller defers the request to its next attempt. The post is never cut short by a shutdown, so a
    /// delivered result is always recorded.
    /// </summary>
    Task<DeliveryAttempt> AttemptAsync(RequestLog request, string payloadJson);
}
