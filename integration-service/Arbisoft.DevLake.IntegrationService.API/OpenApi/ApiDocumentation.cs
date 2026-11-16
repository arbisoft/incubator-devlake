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

using Asp.Versioning;

namespace Arbisoft.DevLake.IntegrationService.API.OpenApi;

/// <summary>
/// The OpenAPI documents (<c>/openapi/{version}.json</c>) and the Swagger UI (<c>/swagger</c>). Both are served only when
/// <c>OpenApi:Enabled</c> is true. API versioning makes one document per API version, and version-neutral endpoints appear in each (API-11).
/// </summary>
public static class ApiDocumentation
{
    private const string EnabledSetting = "OpenApi:Enabled";
    private const string UiRoutePrefix = "swagger";

    public static bool IsEnabled(IConfiguration configuration) => configuration.GetValue<bool>(EnabledSetting);

    /// <summary>Registers the per-version documents, with the security schemes and each operation's requirement, when they are enabled.</summary>
    public static IApiVersioningBuilder AddApiDocumentation(this IApiVersioningBuilder versioning, IConfiguration configuration)
    {
        if (!IsEnabled(configuration))
        {
            return versioning;
        }

        versioning
            .AddApiExplorer(options =>
            {
                options.GroupNameFormat = "'v'VVV";
                options.SubstituteApiVersionInUrl = true;
            })
            .AddOpenApi(options =>
            {
                options.Document.AddDocumentTransformer<SecuritySchemeDocumentTransformer>();
                options.Document.AddOperationTransformer<SecurityRequirementOperationTransformer>();
            });
        return versioning;
    }

    /// <summary>
    /// Maps the documents and the Swagger UI, both open to anyone who can reach the service: the fallback policy would otherwise deny them, and the
    /// UI has to load before its user has a token. Call it after static files and before routing, so the UI is served without the portal's sign-in.
    /// </summary>
    public static WebApplication UseApiDocumentation(this WebApplication app)
    {
        if (!IsEnabled(app.Configuration))
        {
            return app;
        }

        var versions = app.DescribeApiVersions();
        app.UseSwaggerUI(options =>
        {
            options.RoutePrefix = UiRoutePrefix;
            options.DocumentTitle = "Integration Service API";
            foreach (var version in versions.OrderByDescending(version => version.ApiVersion))
            {
                options.SwaggerEndpoint($"/openapi/{version.GroupName}.json", version.GroupName);
            }
        });

        app.MapOpenApi().WithDocumentPerVersion().AllowAnonymous();
        return app;
    }
}
