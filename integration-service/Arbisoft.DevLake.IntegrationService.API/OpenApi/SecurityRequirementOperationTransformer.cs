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

using Arbisoft.DevLake.IntegrationService.API.Controllers;
using Arbisoft.DevLake.IntegrationService.Business.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Arbisoft.DevLake.IntegrationService.API.OpenApi;

/// <summary>
/// Marks each operation with what it takes to call it, read from the endpoint's own authorization metadata: the token endpoint takes the client's
/// HTTP Basic credentials, other anonymous endpoints take nothing, and everything else takes a bearer token with the scopes its policies name.
/// </summary>
public sealed class SecurityRequirementOperationTransformer : IOpenApiOperationTransformer
{
    private static readonly HashSet<string> Scopes = [ScopeNames.StatsRead, ScopeNames.ProjectsFetch];

    public Task TransformAsync(OpenApiOperation operation, OpenApiOperationTransformerContext context, CancellationToken cancellationToken)
    {
        var description = context.Description;
        var metadata = description.ActionDescriptor.EndpointMetadata;

        if (description.ActionDescriptor is ControllerActionDescriptor { ControllerTypeInfo: var controller } && controller == typeof(AuthController))
        {
            operation.Security = [Requirement(SecuritySchemeDocumentTransformer.ClientBasicScheme, context, [])];
            return Task.CompletedTask;
        }

        if (metadata.OfType<IAllowAnonymous>().Any())
        {
            return Task.CompletedTask;
        }

        var scopes = metadata.OfType<IAuthorizeData>()
            .Select(data => data.Policy)
            .OfType<string>()
            .Where(Scopes.Contains)
            .Distinct()
            .ToList();
        operation.Security = [Requirement(SecuritySchemeDocumentTransformer.OAuth2Scheme, context, scopes)];
        return Task.CompletedTask;
    }

    private static OpenApiSecurityRequirement Requirement(string scheme, OpenApiOperationTransformerContext context, List<string> scopes) =>
        new() { [new OpenApiSecuritySchemeReference(scheme, context.Document)] = scopes };
}
