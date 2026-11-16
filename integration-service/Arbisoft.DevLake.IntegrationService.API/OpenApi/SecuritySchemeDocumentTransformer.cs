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

using Arbisoft.DevLake.IntegrationService.Business.Security;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Arbisoft.DevLake.IntegrationService.API.OpenApi;

/// <summary>
/// Describes the document and its two security schemes: OAuth2 client credentials against <c>/auth/token/</c>, which is how every protected
/// endpoint is called and lets the Swagger UI fetch a token itself, and HTTP Basic, which is how the token endpoint itself is called.
/// </summary>
public sealed class SecuritySchemeDocumentTransformer : IOpenApiDocumentTransformer
{
    public const string OAuth2Scheme = "oauth2";
    public const string ClientBasicScheme = "clientBasic";

    /// <summary>The token endpoint, relative to the service, so the UI asks the same host it was loaded from.</summary>
    private const string TokenUrl = "/auth/token/";

    public Task TransformAsync(OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        // API versioning has already set the version and any deprecation notice; only the title and the introduction are added here.
        document.Info ??= new OpenApiInfo();
        document.Info.Title = "Arbisoft DevLake Integration Service";
        document.Info.Description = "Engineer stats for Sophia and Workstream project data for DevLake. Get a token from POST /auth/token/ with the "
            + "client credentials grant and send it as a bearer token. Each endpoint needs the scope it lists.";

        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
        document.Components.SecuritySchemes[OAuth2Scheme] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.OAuth2,
            Description = "Client credentials. The client ID and secret are sent with HTTP Basic, as the token endpoint expects.",
            Flows = new OpenApiOAuthFlows
            {
                ClientCredentials = new OpenApiOAuthFlow
                {
                    TokenUrl = new Uri(TokenUrl, UriKind.Relative),
                    Scopes = new Dictionary<string, string>
                    {
                        [ScopeNames.StatsRead] = "Request engineer stats and poll their status.",
                        [ScopeNames.ProjectsFetch] = "Read Workstream projects and their team leads."
                    }
                }
            }
        };
        document.Components.SecuritySchemes[ClientBasicScheme] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "basic",
            Description = "The client ID as the user name and the client secret as the password. Used only by the token endpoint."
        };

        return Task.CompletedTask;
    }
}
