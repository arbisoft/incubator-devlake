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
using Microsoft.Extensions.Time.Testing;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.Business.Processing;

public class ProcessingRunTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 13, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void ARun_TakesWorkUntilItsBudgetIsUsed()
    {
        var time = new FakeTimeProvider(Now);
        var run = new ProcessingRun(Now.AddSeconds(120), time);

        Assert.True(run.MayTakeWork);
        time.Advance(TimeSpan.FromSeconds(119));
        Assert.True(run.MayTakeWork);
        time.Advance(TimeSpan.FromSeconds(1));
        Assert.False(run.MayTakeWork);
    }

    [Fact]
    public void AHalt_StopsTakingWork_AndKeepsTheFirstReason()
    {
        var run = new ProcessingRun(Now.AddSeconds(120), new FakeTimeProvider(Now));

        run.Halt("DevLake is down");
        run.Halt("something else");

        Assert.False(run.MayTakeWork);
        Assert.Equal("DevLake is down", run.HaltReason);
    }

    [Fact]
    public void AFailingClient_IsRemembered_WithoutAffectingOthers()
    {
        var run = new ProcessingRun(Now.AddSeconds(120), new FakeTimeProvider(Now));

        run.MarkClientFailing(7);

        Assert.True(run.IsClientFailing(7));
        Assert.False(run.IsClientFailing(8));
        Assert.True(run.MayTakeWork);
    }

    [Theory]
    [InlineData(1, 30)]
    [InlineData(2, 60)]
    [InlineData(5, 480)]
    [InlineData(6, 900)]
    [InlineData(40, 900)]
    public void TheDeliveryWait_DoublesAfterEachFailure_UpToTheCap(int failedAttempts, int seconds)
    {
        var options = new ProcessingOptions { DeliveryRetryDelaySeconds = 30, MaxDeliveryRetryDelaySeconds = 900 };

        Assert.Equal(TimeSpan.FromSeconds(seconds), RetryDelays.ForDelivery(failedAttempts, options));
    }

    [Fact]
    public void TenAttemptsWithTheDefaults_FitInsideTheTwoHourRequestLifetime()
    {
        var options = new ProcessingOptions();

        var waits = Enumerable.Range(1, 9).Sum(failed => RetryDelays.ForDelivery(failed, options).TotalSeconds);

        Assert.True(waits < 7200, $"The waits add up to {waits} seconds.");
    }
}
