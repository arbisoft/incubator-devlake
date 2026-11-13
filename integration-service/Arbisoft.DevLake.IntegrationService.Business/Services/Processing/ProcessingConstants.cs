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

public static class ProcessingConstants
{
    /// <summary>Recorded as <c>attemptBy</c> on every attempt the processing job makes.</summary>
    public const string AttemptBy = "RequestProcessor";

    public const string EmptyJson = "{}";
}

/// <summary>The values stored in RequestResponseAttempts.attemptStatus.</summary>
public static class DeliveryAttemptStatus
{
    /// <summary>The client's callback accepted the result.</summary>
    public const string Delivered = "Delivered";

    /// <summary>A try to deliver the result failed. These count towards the client's maxAttempts.</summary>
    public const string DeliveryFailed = "DeliveryFailed";

    /// <summary>The stats could not be collected, so nothing was delivered. This ends the request.</summary>
    public const string FetchFailed = "FetchFailed";

    /// <summary>The request waited in the queue until it expired.</summary>
    public const string Expired = "Expired";

    /// <summary>The API could not put the request on the queue (full, unreachable or too slow), so it was never processed.</summary>
    public const string PublishFailed = "PublishFailed";
}

/// <summary>What happens to a queue message once the job has dealt with it.</summary>
public enum MessageOutcome
{
    /// <summary>The database owns the request now, or it is already finished: remove the message.</summary>
    Ack,

    /// <summary>Put the message back: something went wrong before the request could be taken.</summary>
    Requeue,

    /// <summary>The message can never be processed: move it to the dead-letter queue.</summary>
    DeadLetter
}

/// <summary>What one step of work did to a request.</summary>
public enum StepResult
{
    /// <summary>Nothing: another worker holds the request, it is finished, or it is not due yet.</summary>
    Skipped,

    /// <summary>The request reached Success, Failed or Revoked.</summary>
    Finished,

    /// <summary>The request waits in the database until its next attempt.</summary>
    Deferred
}

/// <summary>The outcome of handling one queue message.</summary>
public sealed record WorkResult(MessageOutcome Message, StepResult Step)
{
    public static WorkResult DeadLettered { get; } = new(MessageOutcome.DeadLetter, StepResult.Skipped);

    public static WorkResult Acknowledged { get; } = new(MessageOutcome.Ack, StepResult.Skipped);
}
