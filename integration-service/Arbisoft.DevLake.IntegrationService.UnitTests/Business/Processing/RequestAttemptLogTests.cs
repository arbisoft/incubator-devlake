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

using Arbisoft.DevLake.IntegrationService.Business.Services.Processing;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.Business.Processing;

public class RequestAttemptLogTests
{
    private static readonly DateTimeOffset Retried = new(2026, 11, 13, 9, 0, 0, TimeSpan.Zero);

    private readonly IRequestLogRepository _logs = Substitute.For<IRequestLogRepository>();

    private static RequestResponseAttempt Attempt(string status, DateTimeOffset on) => new() { RequestLogId = 41, AttemptStatus = status, AttemptOn = on };

    [Fact]
    public async Task OnlyDeliveryAttempts_SinceTheGivenTime_AreCounted()
    {
        _logs.GetAttemptsAsync(41, Arg.Any<CancellationToken>()).Returns(
        [
            Attempt(DeliveryAttemptStatus.DeliveryFailed, Retried.AddHours(-3)),
            Attempt(DeliveryAttemptStatus.DeliveryFailed, Retried.AddHours(-2)),
            Attempt(DeliveryAttemptStatus.Retried, Retried),
            Attempt(DeliveryAttemptStatus.DeliveryFailed, Retried.AddMinutes(1)),
            Attempt(DeliveryAttemptStatus.FetchFailed, Retried.AddMinutes(2)),
            Attempt(DeliveryAttemptStatus.DeliveryFailed, Retried.AddMinutes(3))
        ]);

        var counted = await new RequestAttemptLog(_logs, new FakeTimeProvider(Retried)).CountDeliveryAttemptsAsync(41, Retried, CancellationToken.None);

        Assert.Equal(2, counted);
    }
}
