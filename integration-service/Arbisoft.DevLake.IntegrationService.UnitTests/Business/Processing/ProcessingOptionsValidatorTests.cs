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
using Arbisoft.DevLake.IntegrationService.DataAccess.Options;
using Microsoft.Extensions.Options;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.Business.Processing;

public class ProcessingOptionsValidatorTests
{
    private static ValidateOptionsResult Validate(int republishAfterSeconds, int publishTimeoutSeconds) =>
        new ProcessingOptionsValidator(Options.Create(new RabbitMqOptions { PublishTimeoutSeconds = publishTimeoutSeconds }))
            .Validate(null, new ProcessingOptions { RepublishAfterSeconds = republishAfterSeconds });

    [Fact]
    public void TheDefaults_AreValid()
    {
        Assert.True(Validate(new ProcessingOptions().RepublishAfterSeconds, new RabbitMqOptions().PublishTimeoutSeconds).Succeeded);
    }

    [Theory]
    [InlineData(20, 10)]
    [InlineData(10, 10)]
    [InlineData(5, 10)]
    public void ARelayThatCouldOvertakeAnIntakeStillPublishing_FailsStartup(int republishAfterSeconds, int publishTimeoutSeconds)
    {
        var result = Validate(republishAfterSeconds, publishTimeoutSeconds);

        Assert.True(result.Failed);
        Assert.Contains("RepublishAfterSeconds", result.FailureMessage, StringComparison.Ordinal);
    }

    [Fact]
    public void ARelayWaitingMoreThanTwoPublishTimeouts_IsValid()
    {
        Assert.True(Validate(21, 10).Succeeded);
    }
}
