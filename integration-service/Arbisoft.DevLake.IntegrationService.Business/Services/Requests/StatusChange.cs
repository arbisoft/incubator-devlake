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

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Requests;

/// <summary>Which request a status change is for: its id, and its correlation ID, which the audit trail shows as its name.</summary>
public sealed record RequestKey(long Id, string CorrelationId)
{
    public static RequestKey Of(RequestLog request) => new(request.Id, request.CorrelationId);
}

/// <summary>The status a request moves to, and why, in words fixed by the service: never an upstream error message, which can carry emails.</summary>
public sealed record StatusChange(string To, string Reason);

/// <summary>Why a request's status changed, as the audit trail records it. The details of a failure are in the request's delivery attempts.</summary>
public static class StatusReasons
{
    public const string Published = "Published to the queue";
    public const string Republished = "Published again after it was recorded but not queued";
    public const string QueueRefused = "The queue refused the request";
    public const string MissingBody = "Recorded without a body";
    public const string NoCallbackUrl = "The client has no active callback URL";
    public const string Claimed = "Taken by the processing job";
    public const string Failed = "Processing failed; see the delivery attempts";
    public const string MessageRefused = "The queue's message could not be read";
    public const string Delivered = "Delivered to the client";
    public const string DeliveryRejected = "The client rejected the delivery";
    public const string AttemptsUsedUp = "Delivery attempts used up";
    public const string Waiting = "Waiting for DevLake or the client's credentials";
    public const string RetryingDelivery = "Delivery will be tried again";
    public const string HandedBack = "Handed back when the service stopped";
    public const string Expired = "Expired before it was processed";
}
