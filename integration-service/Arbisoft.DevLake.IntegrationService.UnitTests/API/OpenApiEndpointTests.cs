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

using System.Net;
using System.Text.Json;
using Arbisoft.DevLake.IntegrationService.Business.Security;
using Arbisoft.DevLake.IntegrationService.UnitTests.TestHelpers;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.API;

/// <summary>The OpenAPI document and Swagger UI with <c>OpenApi:Enabled</c> on: open without a token, one document per version, and auth described.</summary>
[Collection(MySqlTestGroup.Name)]
public sealed class OpenApiEndpointTests : ApiTestBase
{
    public OpenApiEndpointTests(MySqlDatabaseFixture database)
        : base(database, new Dictionary<string, string> { ["OpenApi:Enabled"] = "true" })
    {
    }

    private async Task<JsonElement> DocumentAsync()
    {
        var response = await SendAsync(HttpMethod.Get, "/openapi/v1.json", token: null);
        Assert.Equal(HttpStatusCode.OK, response.Status);
        return response.Json;
    }

    private static JsonElement Operation(JsonElement document, string path, string method) =>
        document.GetProperty("paths").GetProperty(path).GetProperty(method);

    /// <summary>The operation's only security requirement, as <c>scheme: scope, scope</c>.</summary>
    private static string OnlyRequirement(JsonElement operation)
    {
        var requirement = Assert.Single(operation.GetProperty("security").EnumerateArray());
        var scheme = Assert.Single(requirement.EnumerateObject());
        return $"{scheme.Name}: {string.Join(", ", scheme.Value.EnumerateArray().Select(scope => scope.GetString()))}";
    }

    [MySqlFact]
    public async Task Document_lists_versioned_and_version_neutral_endpoints_with_the_version_in_the_path()
    {
        var paths = (await DocumentAsync()).GetProperty("paths").EnumerateObject().Select(path => path.Name).ToList();

        Assert.Contains("/api/v1/engineers/{email}/stats", paths);
        Assert.Contains("/api/v1/engineers/stats/batch", paths);
        Assert.Contains("/api/v1/requests/poll/{uuid}", paths);
        // The generator drops the route's trailing slash; routing matches /auth/token/ and /auth/token alike.
        Assert.Contains("/auth/token", paths);
        Assert.Contains("/fetch/projects", paths);
        Assert.DoesNotContain(paths, path => path.Contains("{version", StringComparison.Ordinal));
    }

    [MySqlFact]
    public async Task Document_describes_client_credentials_against_the_token_endpoint()
    {
        var schemes = (await DocumentAsync()).GetProperty("components").GetProperty("securitySchemes");

        var flow = schemes.GetProperty("oauth2").GetProperty("flows").GetProperty("clientCredentials");
        Assert.Equal("/auth/token/", flow.GetProperty("tokenUrl").GetString());
        Assert.True(flow.GetProperty("scopes").TryGetProperty(ScopeNames.StatsRead, out _));
        Assert.True(flow.GetProperty("scopes").TryGetProperty(ScopeNames.ProjectsFetch, out _));
        Assert.Equal("basic", schemes.GetProperty("clientBasic").GetProperty("scheme").GetString());
    }

    [MySqlFact]
    public async Task Each_operation_requires_the_scope_its_policy_names_and_the_token_endpoint_requires_basic()
    {
        var document = await DocumentAsync();

        Assert.Equal($"oauth2: {ScopeNames.StatsRead}", OnlyRequirement(Operation(document, "/api/v1/engineers/{email}/stats", "get")));
        Assert.Equal($"oauth2: {ScopeNames.StatsRead}", OnlyRequirement(Operation(document, "/api/v1/requests/poll/{uuid}", "get")));
        Assert.Equal($"oauth2: {ScopeNames.ProjectsFetch}", OnlyRequirement(Operation(document, "/fetch/projects", "get")));
        Assert.Equal("clientBasic: ", OnlyRequirement(Operation(document, "/auth/token", "post")));
    }

    [MySqlFact]
    public async Task Swagger_ui_is_served_without_a_token()
    {
        var response = await SendAsync(HttpMethod.Get, "/swagger/index.html", token: null);

        Assert.Equal(HttpStatusCode.OK, response.Status);
        Assert.Contains("swagger-ui", response.Text, StringComparison.Ordinal);
    }
}

/// <summary>With <c>OpenApi:Enabled</c> off, as it is by default, neither the document nor the UI is served.</summary>
[Collection(MySqlTestGroup.Name)]
public sealed class OpenApiDisabledEndpointTests : ApiTestBase
{
    public OpenApiDisabledEndpointTests(MySqlDatabaseFixture database)
        : base(database, new Dictionary<string, string> { ["OpenApi:Enabled"] = "false" })
    {
    }

    [MySqlFact]
    public async Task Neither_the_document_nor_the_ui_is_served()
    {
        var document = await SendAsync(HttpMethod.Get, "/openapi/v1.json", token: null);
        var ui = await SendAsync(HttpMethod.Get, "/swagger/index.html", token: null);

        Assert.NotEqual(HttpStatusCode.OK, document.Status);
        Assert.DoesNotContain("swagger-ui", ui.Text, StringComparison.Ordinal);
    }
}
