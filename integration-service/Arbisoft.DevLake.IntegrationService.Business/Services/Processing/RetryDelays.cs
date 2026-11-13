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

/// <summary>How long a request waits before its next attempt.</summary>
public static class RetryDelays
{
    /// <summary>
    /// After <paramref name="failedAttempts"/> failed deliveries: the first delay, doubled after each further failure, or the callback's own
    /// Retry-After when that is longer; never more than the cap, so a request is not pushed past its lifetime.
    /// </summary>
    public static TimeSpan ForDelivery(int failedAttempts, ProcessingOptions options, TimeSpan? retryAfter = null)
    {
        var doublings = Math.Clamp(failedAttempts - 1, 0, 30);
        var backoff = options.DeliveryRetryDelaySeconds * Math.Pow(2, doublings);
        var asked = retryAfter?.TotalSeconds ?? 0;
        return TimeSpan.FromSeconds(Math.Min(Math.Max(backoff, asked), options.MaxDeliveryRetryDelaySeconds));
    }

    /// <summary>After DevLake was down or a client's credentials were refused.</summary>
    public static TimeSpan ForUnavailable(ProcessingOptions options) => TimeSpan.FromSeconds(options.UnavailableRetryDelaySeconds);
}
