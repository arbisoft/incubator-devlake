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

using Arbisoft.DevLake.IntegrationService.DataAccess.Options;
using Microsoft.Extensions.Options;

namespace Arbisoft.DevLake.IntegrationService.Business.Services.Processing;

/// <summary>
/// Fails startup on settings that contradict each other: a relay that could republish a request whose intake is still publishing it (the relay
/// must wait longer than one publish may take), or a longest retry wait shorter than the first.
/// </summary>
public sealed class ProcessingOptionsValidator : IValidateOptions<ProcessingOptions>
{
    private readonly IOptions<RabbitMqOptions> _rabbitMq;

    public ProcessingOptionsValidator(IOptions<RabbitMqOptions> rabbitMq)
    {
        _rabbitMq = rabbitMq;
    }

    public ValidateOptionsResult Validate(string? name, ProcessingOptions options)
    {
        var publishTimeout = _rabbitMq.Value.PublishTimeoutSeconds;
        if (options.RepublishAfterSeconds <= publishTimeout * 2)
        {
            return ValidateOptionsResult.Fail(
                $"Processing:RepublishAfterSeconds ({options.RepublishAfterSeconds}) must be more than twice RabbitMq:PublishTimeoutSeconds ({publishTimeout}).");
        }

        return options.MaxDeliveryRetryDelaySeconds >= options.DeliveryRetryDelaySeconds
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(
                $"Processing:MaxDeliveryRetryDelaySeconds ({options.MaxDeliveryRetryDelaySeconds}) must not be less than Processing:DeliveryRetryDelaySeconds ({options.DeliveryRetryDelaySeconds}).");
    }
}
