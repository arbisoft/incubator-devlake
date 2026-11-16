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

using System.Globalization;
using System.Net;
using System.Text.RegularExpressions;
using Arbisoft.DevLake.IntegrationService.Business.Security;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Arbisoft.DevLake.IntegrationService.UnitTests.TestHelpers;
using Arbisoft.DevLake.IntegrationService.UnitTests.TestHelpers.Builders;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.Web;

/// <summary>The admin portal end to end: real routing, anti-forgery, cookie sign-in and MySQL.</summary>
[Collection(MySqlTestGroup.Name)]
public sealed partial class AdminPortalTests : IAsyncLifetime, IDisposable
{
    private readonly MySqlDatabaseFixture _database;
    private PortalFactory? _factory;
    private HttpClient? _http;

    public AdminPortalTests(MySqlDatabaseFixture database)
    {
        _database = database;
    }

    private HttpClient Http => _http!;

    public Task InitializeAsync()
    {
        if (_database.Services is not null)
        {
            _factory = new PortalFactory(_database.DatabaseConnectionString);
            _http = NewClient(_factory);
        }

        return Task.CompletedTask;
    }

    public Task DisposeAsync() => Task.CompletedTask;

    public void Dispose()
    {
        _http?.Dispose();
        _factory?.Dispose();
    }

    private static HttpClient NewClient(PortalFactory factory) =>
        factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });

    private static string Unique(string prefix) => $"{prefix}{Guid.NewGuid():N}"[..24];

    /// <summary>Fetches a page and returns the anti-forgery token its form carries, which pairs with the cookie the client now holds.</summary>
    private static async Task<string> TokenFromAsync(HttpClient http, string path)
    {
        var html = await http.GetStringAsync(new Uri(path, UriKind.Relative));
        var match = TokenPattern().Match(html);
        Assert.True(match.Success, $"{path} has no anti-forgery token.");
        return match.Groups[1].Value;
    }

    private static async Task<HttpResponseMessage> PostFormAsync(HttpClient http, string path, params (string Key, string Value)[] fields)
    {
        var token = await TokenFromAsync(http, path);
        var form = fields.Select(f => KeyValuePair.Create(f.Key, f.Value)).Append(KeyValuePair.Create("__RequestVerificationToken", token));
        return await http.PostAsync(new Uri(path, UriKind.Relative), new FormUrlEncodedContent(form));
    }

    private async Task SignInAsync()
    {
        var response = await PostFormAsync(Http, "/Account/Login", ("Username", PortalFactory.AdminUsername), ("Password", PortalFactory.AdminPassword));
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
    }

    [MySqlFact]
    public async Task EveryPage_SendsAnAnonymousVisitorToTheSignInPage()
    {
        foreach (var path in new[] { "/", "/Clients", "/Scopes", "/SigningKeys", "/AccessTokens", "/Clients/Create", "/EmailMappings", "/ClientConfigs", "/RequestLogs" })
        {
            var response = await Http.GetAsync(new Uri(path, UriKind.Relative));

            Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
            Assert.Contains("/Account/Login", response.Headers.Location!.OriginalString, StringComparison.Ordinal);
        }
    }

    [MySqlFact]
    public async Task TheHealthProbe_IsOpenWithoutSignIn()
    {
        var response = await Http.GetAsync(new Uri("/health/live", UriKind.Relative));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [MySqlFact]
    public async Task APostWithoutTheAntiForgeryToken_IsRefused()
    {
        await SignInAsync();

        var response = await Http.PostAsync(new Uri("/Scopes/Create", UriKind.Relative), new FormUrlEncodedContent([KeyValuePair.Create("Name", "x:y")]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [MySqlFact]
    public async Task SignIn_WithAWrongPassword_ShowsAnErrorAndGivesNoAccess()
    {
        var response = await PostFormAsync(Http, "/Account/Login", ("Username", PortalFactory.AdminUsername), ("Password", "wrong"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("The username or password is wrong.", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.Redirect, (await Http.GetAsync(new Uri("/Clients", UriKind.Relative))).StatusCode);
    }

    [MySqlFact]
    public async Task SignIn_WithAWrongUsername_IsRefused()
    {
        var response = await PostFormAsync(Http, "/Account/Login", ("Username", "someone"), ("Password", PortalFactory.AdminPassword));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [MySqlFact]
    public async Task TheSignInPage_OffersSingleSignOn_OnlyOnceItIsConfigured()
    {
        Assert.DoesNotContain("Sign in with", await Http.GetStringAsync(new Uri("/Account/Login", UriKind.Relative)), StringComparison.Ordinal);

        using var factory = new PortalFactory(_database.DatabaseConnectionString, new Dictionary<string, string>
        {
            ["Sso:Enabled"] = "true",
            ["Sso:DisplayName"] = "Arbisoft Google",
            ["Sso:Authority"] = "https://accounts.google.com",
            ["Sso:ClientId"] = "client-id",
            ["Sso:ClientSecret"] = "client-secret"
        });
        using var http = NewClient(factory);

        Assert.Contains("Sign in with Arbisoft Google", await http.GetStringAsync(new Uri("/Account/Login", UriKind.Relative)), StringComparison.Ordinal);
    }

    [MySqlFact]
    public void SingleSignOn_SwitchedOnButIncomplete_StopsThePortalStarting()
    {
        using var factory = new PortalFactory(_database.DatabaseConnectionString, new Dictionary<string, string> { ["Sso:Enabled"] = "true" });

        var problem = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains("Sso:Authority", problem.ToString(), StringComparison.Ordinal);
    }

    [MySqlFact]
    public async Task ADefaultPassword_MustBeChanged_BeforeAnythingElse_ThenThePortalOpens()
    {
        var username = Unique("first");
        await _factory!.AddLocalUserAsync(username, "admin", PortalRole.Admin, mustChangePassword: true);

        var signedIn = await PostFormAsync(Http, "/Account/Login", ("Username", username), ("Password", "admin"));
        Assert.Equal("/Account/ChangePassword", signedIn.Headers.Location!.OriginalString);
        var blocked = await Http.GetAsync(new Uri("/Clients", UriKind.Relative));
        Assert.Equal(HttpStatusCode.Redirect, blocked.StatusCode);
        Assert.Equal("/Account/ChangePassword", blocked.Headers.Location!.OriginalString);
        Assert.Contains("default password", await Http.GetStringAsync(new Uri("/Account/ChangePassword", UriKind.Relative)), StringComparison.Ordinal);

        var tooShort = await PostFormAsync(Http, "/Account/ChangePassword", ("CurrentPassword", "admin"), ("NewPassword", "short"), ("ConfirmPassword", "short"));
        Assert.Equal(HttpStatusCode.OK, tooShort.StatusCode);
        var changed = await PostFormAsync(Http, "/Account/ChangePassword", ("CurrentPassword", "admin"), ("NewPassword", "a much better password"), ("ConfirmPassword", "a much better password"));

        Assert.Equal(HttpStatusCode.Redirect, changed.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Http.GetAsync(new Uri("/Clients", UriKind.Relative))).StatusCode);
        using var again = NewClient(_factory);
        Assert.Equal(HttpStatusCode.OK, (await PostFormAsync(again, "/Account/Login", ("Username", username), ("Password", "admin"))).StatusCode);
    }

    [MySqlFact]
    public async Task SomeoneWithoutAccess_SeesOnlyTheAskTheAdministratorPage_UntilAnAdministratorGrantsIt()
    {
        var username = Unique("noaccess");
        var userId = await _factory!.AddLocalUserAsync(username, "a long user password", PortalRole.None);
        using var user = NewClient(_factory);
        await PostFormAsync(user, "/Account/Login", ("Username", username), ("Password", "a long user password"));

        var refused = await user.GetAsync(new Uri("/Clients", UriKind.Relative));
        Assert.Equal(HttpStatusCode.Redirect, refused.StatusCode);
        Assert.StartsWith("http://localhost/Account/NoAccess", refused.Headers.Location!.AbsoluteUri, StringComparison.Ordinal);
        var page = await user.GetStringAsync(new Uri("/Account/NoAccess", UriKind.Relative));
        Assert.Contains("Ask the administrator to provide the access to the portal", page, StringComparison.Ordinal);
        Assert.DoesNotContain("Request logs", page, StringComparison.Ordinal);

        await SignInAsync();
        var granted = await PostFormAsync(Http, "/Users", ("id", userId.ToString(CultureInfo.InvariantCulture)), ("role", PortalRole.Editor), ("isActive", "true"));
        Assert.Equal(HttpStatusCode.Redirect, granted.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await user.GetAsync(new Uri("/Clients", UriKind.Relative))).StatusCode);
        Assert.Equal(HttpStatusCode.Redirect, (await user.GetAsync(new Uri("/Users", UriKind.Relative))).StatusCode);
    }

    [MySqlFact]
    public async Task DisablingAnAccount_EndsItsSessionAtOnce()
    {
        var username = Unique("editor");
        var userId = await _factory!.AddLocalUserAsync(username, "a long user password", PortalRole.Editor);
        using var user = NewClient(_factory);
        await PostFormAsync(user, "/Account/Login", ("Username", username), ("Password", "a long user password"));
        Assert.Equal(HttpStatusCode.OK, (await user.GetAsync(new Uri("/Clients", UriKind.Relative))).StatusCode);

        await SignInAsync();
        await PostFormAsync(Http, "/Users", ("id", userId.ToString(CultureInfo.InvariantCulture)), ("role", PortalRole.Editor), ("isActive", "false"));

        var after = await user.GetAsync(new Uri("/Clients", UriKind.Relative));
        Assert.Equal(HttpStatusCode.Redirect, after.StatusCode);
        Assert.Contains("/Account/Login", after.Headers.Location!.OriginalString, StringComparison.Ordinal);
    }

    [MySqlFact]
    public async Task OnePortalAndApiHost_KeepsTheCookieAndTheBearerTokenApart()
    {
        await SignInAsync();

        // The portal's cookie opens pages but is no credential for the client API, and a bearer token is no credential for a page.
        Assert.Equal(HttpStatusCode.Unauthorized, (await Http.GetAsync(new Uri("/api/v1/requests/1", UriKind.Relative))).StatusCode);
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri("/Clients", UriKind.Relative));
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "not-a-portal-cookie");
        using var anonymous = NewClient(_factory!);
        var page = await anonymous.SendAsync(request);
        Assert.Equal(HttpStatusCode.Redirect, page.StatusCode);
        Assert.Contains("/Account/Login", page.Headers.Location!.OriginalString, StringComparison.Ordinal);
    }

    [MySqlFact]
    public async Task TheRequestLogList_AnswersTheQueryTheBrowserSends_WithEveryFilterLeftEmpty()
    {
        await SignInAsync();
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(
            "/RequestLogs?handler=List&ClientRefId=&Status=&From=&To=&draw=1&pageNumber=1&pageSize=10&sort=created&dir=desc&_=1763290000000", UriKind.Relative));
        request.Headers.Add("X-Requested-With", "XMLHttpRequest");
        request.Headers.Accept.ParseAdd("application/json, text/javascript, */*; q=0.01");

        var response = await Http.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"draw\":1", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [MySqlFact]
    public async Task TheUsersPage_IsForAdministrators_AndNobodyChangesTheirOwnAccess()
    {
        await SignInAsync();
        var page = await Http.GetStringAsync(new Uri("/Users", UriKind.Relative));
        Assert.Contains(PortalFactory.AdminUsername, page, StringComparison.Ordinal);
        Assert.Contains("(you)", page, StringComparison.Ordinal);

        await using var scope = _factory!.Services.CreateAsyncScope();
        var self = (await scope.ServiceProvider.GetRequiredService<IPortalUserRepository>().GetByUsernameAsync(PortalFactory.AdminUsername, CancellationToken.None))!;
        var own = await PostFormAsync(Http, "/Users", ("id", self.Id.ToString(CultureInfo.InvariantCulture)), ("role", PortalRole.None), ("isActive", "true"));

        Assert.Equal(HttpStatusCode.OK, own.StatusCode);
        Assert.Contains("You cannot change your own access", await own.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [MySqlFact]
    public async Task SignIn_ReturnsToALocalPage_ButNeverToAnotherSite()
    {
        var local = await PostFormAsync(Http, "/Account/Login?ReturnUrl=%2FScopes", ("Username", PortalFactory.AdminUsername), ("Password", PortalFactory.AdminPassword));
        Assert.Equal("/Scopes", local.Headers.Location!.OriginalString);

        using var other = NewClient(_factory!);
        var external = await PostFormAsync(other, "/Account/Login?ReturnUrl=https%3A%2F%2Fevil.example%2F", ("Username", PortalFactory.AdminUsername), ("Password", PortalFactory.AdminPassword));
        Assert.Equal("/", external.Headers.Location!.OriginalString);
    }

    [MySqlFact]
    public async Task SignOut_EndsTheSession()
    {
        await SignInAsync();
        Assert.Equal(HttpStatusCode.OK, (await Http.GetAsync(new Uri("/Clients", UriKind.Relative))).StatusCode);

        var token = await TokenFromAsync(Http, "/Clients");
        await Http.PostAsync(new Uri("/Account/Logout", UriKind.Relative), new FormUrlEncodedContent([KeyValuePair.Create("__RequestVerificationToken", token)]));

        Assert.Equal(HttpStatusCode.Redirect, (await Http.GetAsync(new Uri("/Clients", UriKind.Relative))).StatusCode);
    }

    [MySqlFact]
    public async Task SigningIn_FailingToSignIn_AndSigningOut_AreEachInTheAdministratorsHistory()
    {
        await using var scope = _factory!.Services.CreateAsyncScope();
        var admin = (await scope.ServiceProvider.GetRequiredService<IPortalUserRepository>().GetByUsernameAsync(PortalFactory.AdminUsername, CancellationToken.None))!;

        await PostFormAsync(Http, "/Account/Login", ("Username", PortalFactory.AdminUsername), ("Password", "wrong"));
        await SignInAsync();
        var token = await TokenFromAsync(Http, "/Clients");
        await Http.PostAsync(new Uri("/Account/Logout", UriKind.Relative), new FormUrlEncodedContent([KeyValuePair.Create("__RequestVerificationToken", token)]));

        var history = (await scope.ServiceProvider.GetRequiredService<IAuditLogRepository>().ListAsync(
            new AuditLogFilter(EntityType: "PortalUser", EntityId: admin.Id.ToString(CultureInfo.InvariantCulture)), 1, 3, CancellationToken.None)).Items;
        Assert.Equal(["SignedOut", "SignedIn", "SignInRefused"], history.Select(entry => entry.Action));
        Assert.Equal([PortalFactory.AdminUsername, PortalFactory.AdminUsername, "unknown"], history.Select(entry => entry.ActorName));
        Assert.Equal("Wrong password", history[2].Reason);
    }

    [MySqlFact]
    public async Task EveryList_OffersEachRowsHistory_AndTheHistoryShowsWhatHappenedToThatObjectOnly()
    {
        await SignInAsync();
        var client = await CreateClientAsync();
        var other = await CreateClientAsync();
        var id = client.Id.ToString(CultureInfo.InvariantCulture);

        var list = await Http.GetStringAsync(new Uri("/Clients", UriKind.Relative));
        Assert.Contains($"href=\"/AuditLogs/History?type=Client&amp;id={id}\"", list, StringComparison.Ordinal);
        foreach (var path in new[] { "/Scopes", "/SigningKeys", "/AccessTokens", "/ClientConfigs", "/EmailMappings", "/UpstreamTokens", "/Users" })
        {
            Assert.Contains("/AuditLogs/History?type=", await Http.GetStringAsync(new Uri(path, UriKind.Relative)), StringComparison.Ordinal);
        }

        Assert.Contains("data-history-url=\"/AuditLogs/History?type=Request&amp;id=0\"", await Http.GetStringAsync(new Uri("/RequestLogs", UriKind.Relative)), StringComparison.Ordinal);

        await PostFormAsync(Http, $"/Clients/Edit/{client.Id}", ("Form.ClientId", client.ClientId), ("Form.Name", "Renamed for history"), ("Form.AccessTokenLifetimeSeconds", "900"), ("Form.IsActive", "true"));
        var history = await Http.GetStringAsync(new Uri($"/AuditLogs/History?type=Client&id={id}", UriKind.Relative));
        Assert.Contains("History of Renamed for history", history, StringComparison.Ordinal);
        Assert.Contains("<del>Config test</del>", history, StringComparison.Ordinal);
        Assert.Contains("<ins>Renamed for history</ins>", history, StringComparison.Ordinal);
        Assert.DoesNotContain(other.ClientId, history, StringComparison.Ordinal);

        // The history dialog loads the same history without the page around it.
        var dialog = await Http.GetStringAsync(new Uri($"/AuditLogs/History?type=Client&id={id}&handler=Modal", UriKind.Relative));
        Assert.Contains("data-history-name=\"Renamed for history\"", dialog, StringComparison.Ordinal);
        Assert.Contains("<ins>Renamed for history</ins>", dialog, StringComparison.Ordinal);
        Assert.DoesNotContain("<html", dialog, StringComparison.OrdinalIgnoreCase);
        Assert.Contains($"data-history-label=\"{client.Name}\"", list, StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.NotFound, (await Http.GetAsync(new Uri("/AuditLogs/History?type=Spaceship&id=1&handler=Modal", UriKind.Relative))).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await Http.GetAsync(new Uri("/AuditLogs/History?type=Spaceship&id=1", UriKind.Relative))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Http.GetAsync(new Uri("/AuditLogs/History?type=Client", UriKind.Relative))).StatusCode);
    }

    [MySqlFact]
    public async Task TheAuditLog_ShowsPeoplesActionsUnlessAskedForTheService()
    {
        await SignInAsync();
        await CreateClientAsync();

        var people = await Http.GetStringAsync(new Uri("/AuditLogs", UriKind.Relative));
        Assert.Contains(PortalFactory.AdminUsername, people, StringComparison.Ordinal);
        Assert.DoesNotMatch(WhoCell("Integration Service"), people);
        Assert.Matches(WhoCell(Regex.Escape(PortalFactory.AdminUsername)), people);
        Assert.Matches(@"<td class=""nowrap"">\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC</td>", people);

        var service = await Http.GetStringAsync(new Uri("/AuditLogs?Who=System", UriKind.Relative));
        Assert.DoesNotMatch(WhoCell(Regex.Escape(PortalFactory.AdminUsername)), service);
    }

    /// <summary>The audit table's "who" cell for <paramref name="name"/>, which is plain text, optionally followed by the caller's IP.</summary>
    private static string WhoCell(string name) => $@"<td>\s*{name}\s*(<div|</td>)";

    [MySqlFact]
    public async Task ACreatedClient_ShowsASecretOnceAndKeepsOnlyItsHash()
    {
        await SignInAsync();
        var clientId = Unique("portal.");

        var created = await PostFormAsync(Http, "/Clients/Create", ("Form.ClientId", clientId), ("Form.Name", "Portal test"), ("Form.AccessTokenLifetimeSeconds", "900"), ("Form.IsActive", "true"), ("Form.IsActive", "false"));
        Assert.Equal(HttpStatusCode.Redirect, created.StatusCode);

        await using var scope = _factory!.Services.CreateAsyncScope();
        var clients = scope.ServiceProvider.GetRequiredService<IClientRepository>();
        var client = await clients.GetByClientIdAsync(clientId, CancellationToken.None);
        Assert.NotNull(client);
        Assert.Equal(PortalFactory.AdminUsername, client.CreatedBy);
        Assert.True(client.IsActive);

        var secretPage = await PostFormAsync(Http, $"/Clients/{client.Id}/Secrets/Create", ("ValidForDays", "30"));
        var body = await secretPage.Content.ReadAsStringAsync();
        var plain = SecretPattern().Match(body);
        Assert.True(plain.Success, "The page should show the new secret.");
        Assert.Contains("no-store", secretPage.Headers.CacheControl!.ToString(), StringComparison.Ordinal);

        var details = await Http.GetStringAsync(new Uri($"/Clients/Details/{client.Id}", UriKind.Relative));
        Assert.DoesNotContain(plain.Groups[1].Value, details, StringComparison.Ordinal);

        var stored = Assert.Single(await clients.GetSecretsAsync(client.Id, CancellationToken.None));
        Assert.NotEqual(plain.Groups[1].Value, stored.Secret);
        Assert.True(new ClientSecretHasher().Verify(plain.Groups[1].Value, stored.Secret));
    }

    [MySqlFact]
    public async Task ACreatedScope_IsListed_AndADuplicateIsRefused()
    {
        await SignInAsync();
        var name = Unique("e2e:").ToLowerInvariant();

        var first = await PostFormAsync(Http, "/Scopes/Create", ("Name", name), ("Description", "from a test"));
        Assert.Equal(HttpStatusCode.Redirect, first.StatusCode);
        Assert.Contains(name, await Http.GetStringAsync(new Uri("/Scopes", UriKind.Relative)), StringComparison.Ordinal);

        var second = await PostFormAsync(Http, "/Scopes/Create", ("Name", name), ("Description", string.Empty));
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Contains("already exists", await second.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [MySqlFact]
    public async Task RotatingTheSigningKey_AddsAnActiveKey_AndStoresItsPrivateHalfEncrypted()
    {
        await SignInAsync();

        var response = await PostFormAsync(Http, "/SigningKeys/Rotate");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);

        await using var scope = _factory!.Services.CreateAsyncScope();
        var active = await scope.ServiceProvider.GetRequiredService<ISigningKeyRepository>().GetActiveAsync(DateTimeOffset.UtcNow, CancellationToken.None);
        Assert.NotNull(active);
        var stored = await scope.ServiceProvider.GetRequiredService<ISecretStoreRepository>().GetEncryptedValueAsync(active.PrivateKeyRef, CancellationToken.None);
        Assert.NotNull(stored);
        Assert.DoesNotContain("PRIVATE KEY", stored, StringComparison.Ordinal);
        var secrets = scope.ServiceProvider.GetRequiredService<ISecretStore>();
        Assert.Contains("PRIVATE KEY", (await secrets.GetAsync(active.PrivateKeyRef, CancellationToken.None))!, StringComparison.Ordinal);
    }

    [MySqlFact]
    public async Task EveryPage_RendersForASignedInAdmin()
    {
        await SignInAsync();
        var clientId = Unique("render.");
        await PostFormAsync(Http, "/Clients/Create", ("Form.ClientId", clientId), ("Form.Name", "Render test"), ("Form.AccessTokenLifetimeSeconds", "900"), ("Form.IsActive", "true"), ("Form.IsActive", "false"));
        await using var scope = _factory!.Services.CreateAsyncScope();
        var client = (await scope.ServiceProvider.GetRequiredService<IClientRepository>().GetByClientIdAsync(clientId, CancellationToken.None))!;
        var statsScope = (await scope.ServiceProvider.GetRequiredService<IScopeRepository>().GetByNameAsync("stats:read", CancellationToken.None))!;
        await PostFormAsync(Http, $"/Clients/{client.Id}/Secrets/Create", ("ValidForDays", "30"));
        var secret = Assert.Single(await scope.ServiceProvider.GetRequiredService<IClientRepository>().GetSecretsAsync(client.Id, CancellationToken.None));

        var paths = new[]
        {
            "/", "/Clients", "/Clients/Create", $"/Clients/Details/{client.Id}", $"/Clients/Edit/{client.Id}", $"/Clients/{client.Id}/Secrets/Create",
            $"/Clients/{client.Id}/Secrets/{secret.Id}/Revoke", "/Scopes", "/Scopes/Create", $"/Scopes/Edit/{statsScope.Id}", "/SigningKeys", "/SigningKeys/Rotate", "/AccessTokens", "/UpstreamTokens",
            "/AuditLogs", "/AuditLogs?Who=All&EntityType=Client&Action=Created&From=2026-01-01&To=2026-12-31&PageNumber=2", $"/AuditLogs/History?type=Client&id={client.Id}"
        };
        foreach (var path in paths)
        {
            var response = await Http.GetAsync(new Uri(path, UriKind.Relative));

            Assert.True(response.StatusCode == HttpStatusCode.OK, $"{path} answered {(int)response.StatusCode}.");
        }

        Assert.Equal(HttpStatusCode.NotFound, (await Http.GetAsync(new Uri("/Clients/Details/999999999", UriKind.Relative))).StatusCode);
    }

    private async Task<Client> CreateClientAsync()
    {
        var clientId = Unique("cfg.");
        await PostFormAsync(Http, "/Clients/Create", ("Form.ClientId", clientId), ("Form.Name", "Config test"), ("Form.AccessTokenLifetimeSeconds", "900"), ("Form.IsActive", "true"), ("Form.IsActive", "false"));
        await using var scope = _factory!.Services.CreateAsyncScope();
        return (await scope.ServiceProvider.GetRequiredService<IClientRepository>().GetByClientIdAsync(clientId, CancellationToken.None))!;
    }

    [MySqlFact]
    public async Task AnEmailMapping_IsStoredNormalized_KeepsWhatWasTyped_AndRefusesADuplicate()
    {
        await SignInAsync();
        var owner = $"{Unique("map")}@arbisoft.com".ToLowerInvariant();

        var created = await PostFormAsync(Http, "/EmailMappings/Create", ("Form.ArbisoftEmail", owner.ToUpperInvariant()), ("Form.Email", " Jane.Doe@Gmail.COM "));
        Assert.Equal(HttpStatusCode.Redirect, created.StatusCode);

        await using var scope = _factory!.Services.CreateAsyncScope();
        var repository = scope.ServiceProvider.GetRequiredService<IEmailMappingRepository>();
        var stored = Assert.Single((await repository.ListAsync(owner, 1, 10, CancellationToken.None)).Items);
        Assert.Equal(owner, stored.ArbisoftEmail);
        Assert.Equal("jane.doe@gmail.com", stored.Email);
        Assert.Equal(" Jane.Doe@Gmail.COM ", stored.EmailAsReceived);
        Assert.Equal(["jane.doe@gmail.com"], await repository.GetMappedEmailsAsync(owner, CancellationToken.None));

        var duplicate = await PostFormAsync(Http, "/EmailMappings/Create", ("Form.ArbisoftEmail", owner), ("Form.Email", "JANE.DOE@gmail.com"));
        Assert.Equal(HttpStatusCode.OK, duplicate.StatusCode);
        Assert.Contains("already exists", await duplicate.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var wrongDomain = await PostFormAsync(Http, "/EmailMappings/Create", ("Form.ArbisoftEmail", "someone@gmail.com"), ("Form.Email", "x@gmail.com"));
        Assert.Contains("Arbisoft", await wrongDomain.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var edited = await PostFormAsync(Http, $"/EmailMappings/Edit/{stored.Id}", ("Form.ArbisoftEmail", owner), ("Form.Email", "other@gmail.com"));
        Assert.Equal(HttpStatusCode.Redirect, edited.StatusCode);
        Assert.Equal(["other@gmail.com"], await repository.GetMappedEmailsAsync(owner, CancellationToken.None));

        Assert.Contains(owner, await Http.GetStringAsync(new Uri($"/EmailMappings?Search={Uri.EscapeDataString(owner[..10].ToUpperInvariant())}", UriKind.Relative)), StringComparison.Ordinal);
    }

    [MySqlFact]
    public async Task AnOutboundConfig_StoresItsSecretEncrypted_NeverShowsItBack_AndKeepsItWhenLeftBlank()
    {
        await SignInAsync();
        var client = await CreateClientAsync();
        var path = $"/ClientConfigs/Edit/{client.Id}";
        const string secret = "super-secret-value-123";

        var saved = await PostFormAsync(Http, path, ("Form.AuthType", "OAuth2ClientCredentials"), ("Form.BaseUrl", "https://sophia.example.com"), ("Form.TokenUrl", "https://sophia.example.com/oauth2/token/"),
            ("Form.OutboundClientId", "devlake"), ("Form.OutboundClientSecret", secret), ("Form.OutboundScope", "callback"), ("Form.MaxAttempts", "4"), ("Form.IsActive", "true"), ("Form.IsActive", "false"));
        Assert.Equal(HttpStatusCode.Redirect, saved.StatusCode);

        await using var scope = _factory!.Services.CreateAsyncScope();
        var configs = scope.ServiceProvider.GetRequiredService<IClientConfigRepository>();
        var config = (await configs.GetByClientRefIdAsync(client.Id, CancellationToken.None))!;
        Assert.Equal(PortalFactory.AdminUsername, config.CreatedBy);
        Assert.Equal(4, config.MaxAttempts);
        Assert.NotNull(config.TokenRotatedOn);
        Assert.NotEqual(secret, config.OutboundClientSecretEncrypted);
        Assert.Equal(secret, scope.ServiceProvider.GetRequiredService<ISecretEncryptor>().Decrypt(config.OutboundClientSecretEncrypted!));

        foreach (var shown in new[] { path, $"/ClientConfigs/Details/{client.Id}", "/ClientConfigs" })
        {
            Assert.DoesNotContain(secret, await Http.GetStringAsync(new Uri(shown, UriKind.Relative)), StringComparison.Ordinal);
        }

        var kept = await PostFormAsync(Http, path, ("Form.AuthType", "OAuth2ClientCredentials"), ("Form.BaseUrl", "https://sophia.example.com"), ("Form.TokenUrl", "https://sophia.example.com/oauth2/token/"),
            ("Form.OutboundClientId", "devlake"), ("Form.OutboundClientSecret", string.Empty), ("Form.MaxAttempts", "5"), ("Form.IsActive", "true"), ("Form.IsActive", "false"));
        Assert.Equal(HttpStatusCode.Redirect, kept.StatusCode);
        var after = (await configs.GetByClientRefIdAsync(client.Id, CancellationToken.None))!;
        Assert.Equal(config.OutboundClientSecretEncrypted, after.OutboundClientSecretEncrypted);
        Assert.Equal(5, after.MaxAttempts);
        Assert.Equal(PortalFactory.AdminUsername, after.ModifiedBy);

        var insecure = await PostFormAsync(Http, path, ("Form.AuthType", "OAuth2ClientCredentials"), ("Form.BaseUrl", "http://sophia.example.com"), ("Form.TokenUrl", "https://x.example.com/t"),
            ("Form.OutboundClientId", "devlake"), ("Form.MaxAttempts", "3"), ("Form.IsActive", "true"));
        Assert.Equal(HttpStatusCode.OK, insecure.StatusCode);
        Assert.Contains("HTTPS", await insecure.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [MySqlFact]
    public async Task CallbackUrls_AllowOnlyOneActiveUrlPerEventType()
    {
        await SignInAsync();
        var client = await CreateClientAsync();
        await PostFormAsync(Http, $"/ClientConfigs/Edit/{client.Id}", ("Form.AuthType", "ApiToken"), ("Form.BaseUrl", "https://sophia.example.com"), ("Form.ApiToken", "tok"), ("Form.MaxAttempts", "3"), ("Form.IsActive", "true"), ("Form.IsActive", "false"));
        var createPath = $"/ClientConfigs/{client.Id}/Urls/Create";

        var first = await PostFormAsync(Http, createPath, ("Form.EventType", "engineer-stats"), ("Form.Method", "POST"), ("Form.Path", "/callback/"), ("Form.IsActive", "true"), ("Form.IsActive", "false"));
        Assert.Equal(HttpStatusCode.Redirect, first.StatusCode);

        var second = await PostFormAsync(Http, createPath, ("Form.EventType", "engineer-stats"), ("Form.Method", "POST"), ("Form.Path", "/other/"), ("Form.IsActive", "true"));
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Contains("already active", await second.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var offHost = await PostFormAsync(Http, createPath, ("Form.EventType", "engineer-stats-batch"), ("Form.Method", "POST"), ("Form.Path", "//evil.example.com/x"), ("Form.IsActive", "true"));
        Assert.Equal(HttpStatusCode.OK, offHost.StatusCode);

        await using var scope = _factory!.Services.CreateAsyncScope();
        var configs = scope.ServiceProvider.GetRequiredService<IClientConfigRepository>();
        var config = (await configs.GetByClientRefIdAsync(client.Id, CancellationToken.None))!;
        var url = Assert.Single(await configs.GetOutboundUrlsAsync(config.Id, CancellationToken.None));
        Assert.Equal("/callback/", url.Path);
        Assert.Equal(PortalFactory.AdminUsername, url.CreatedBy);

        var edited = await PostFormAsync(Http, $"/ClientConfigs/{client.Id}/Urls/{url.Id}/Edit", ("Form.EventType", "engineer-stats"), ("Form.Method", "PUT"), ("Form.Path", "/callback/"), ("Form.IsActive", "true"), ("Form.IsActive", "false"));
        Assert.Equal(HttpStatusCode.Redirect, edited.StatusCode);
        Assert.Equal("PUT", (await configs.GetOutboundUrlByIdAsync(url.Id, CancellationToken.None))!.Method);
    }

    [MySqlFact]
    public async Task RequestLogs_CanBeFiltered_AndOneShowsItsBodyAndDeliveryAttempts()
    {
        await SignInAsync();
        var client = await CreateClientAsync();
        await using var scope = _factory!.Services.CreateAsyncScope();
        var logs = scope.ServiceProvider.GetRequiredService<IRequestLogRepository>();
        var correlation = Guid.NewGuid().ToString();
        var id = await logs.InsertAsync(
            new RequestLog { ClientRefId = client.Id, CorrelationId = correlation, Url = "/api/v1/engineers/x/stats?tf=24h", Status = RequestStatus.Failed, EventType = "engineer-stats", CreatedOn = DateTimeOffset.UtcNow },
            CancellationToken.None);
        await logs.InsertJsonAsync(new RequestLogJson { RequestLogId = id, Json = "{\"email\":\"jane@arbisoft.com\",\"time_frame\":\"24h\"}" }, CancellationToken.None);
        await logs.InsertAttemptAsync(
            new RequestResponseAttempt { RequestLogId = id, ResponseJson = "{\"detail\":\"bad gateway\"}", RequestJson = "{\"sent\":\"to-the-callback\"}", AttemptStatus = "Failed", FailureError = "HTTP 502", AttemptBy = "job", AttemptOn = DateTimeOffset.UtcNow },
            CancellationToken.None);

        var today = DateTime.UtcNow.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        var page = await Http.GetStringAsync(new Uri("/RequestLogs", UriKind.Relative));
        Assert.Contains("Modified On", page, StringComparison.Ordinal);
        Assert.Contains("data-page-sizes=\"10,20,30,40,50\"", page, StringComparison.Ordinal);

        async Task<string> ListAsync(string query) =>
            await Http.GetStringAsync(new Uri($"/RequestLogs?handler=List&draw=7&pageNumber=1&pageSize=10&ClientRefId={client.Id}&{query}", UriKind.Relative));
        var listed = await ListAsync($"Status=Failed&From={today}&To={today}&sort=created&dir=desc");
        Assert.Contains(correlation, listed, StringComparison.Ordinal);
        Assert.Contains("\"draw\":7", listed, StringComparison.Ordinal);
        Assert.Contains("\"recordsTotal\":1", listed, StringComparison.Ordinal);
        // "page" is reserved by Razor Pages for the page's own path, so the page number has another name; the second page of one row is empty.
        var secondPage = await Http.GetStringAsync(new Uri($"/RequestLogs?handler=List&draw=8&pageNumber=2&pageSize=10&ClientRefId={client.Id}", UriKind.Relative));
        Assert.DoesNotContain(correlation, secondPage, StringComparison.Ordinal);
        Assert.Contains("\"recordsTotal\":1", secondPage, StringComparison.Ordinal);
        var otherStatus = await ListAsync("Status=Success");
        Assert.DoesNotContain(correlation, otherStatus, StringComparison.Ordinal);
        var otherDay = await ListAsync("From=2000-01-01&To=2000-01-02");
        Assert.DoesNotContain(correlation, otherDay, StringComparison.Ordinal);
        var unknownSort = await ListAsync("sort=%3BDROP%20TABLE%20RequestLogs&dir=sideways");
        Assert.Contains(correlation, unknownSort, StringComparison.Ordinal);

        var details = await Http.GetStringAsync(new Uri($"/RequestLogs/Details/{id}", UriKind.Relative));
        Assert.Contains("jane@arbisoft.com", details, StringComparison.Ordinal);
        Assert.Contains("HTTP 502", details, StringComparison.Ordinal);
        Assert.Contains("bad gateway", details, StringComparison.Ordinal);
        Assert.Contains("Sent to the callback", details, StringComparison.Ordinal);
        Assert.Contains("to-the-callback", details, StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.NotFound, (await Http.GetAsync(new Uri("/RequestLogs/Details/999999999", UriKind.Relative))).StatusCode);
    }

    [MySqlFact]
    public async Task AnUpstreamToken_IsSavedEncrypted_ShownOnlyAsSetWithWhoSavedIt_AndAnEmptyOneIsRefused()
    {
        await SignInAsync();
        const string token = "devlake-api-token-from-the-portal";

        var saved = await PostFormAsync(Http, "/UpstreamTokens?handler=Save", ("system", "DevLake"), ("token", token));

        Assert.Equal(HttpStatusCode.Redirect, saved.StatusCode);
        await using var scope = _factory!.Services.CreateAsyncScope();
        var stored = await scope.ServiceProvider.GetRequiredService<ISecretStoreRepository>().GetEncryptedValueAsync("upstream.devlake.api-token", CancellationToken.None);
        Assert.NotNull(stored);
        Assert.DoesNotContain(token, stored, StringComparison.Ordinal);
        var page = await Http.GetStringAsync(new Uri("/UpstreamTokens", UriKind.Relative));
        Assert.Contains($"by {PortalFactory.AdminUsername}", page, StringComparison.Ordinal);
        Assert.DoesNotContain(token, page, StringComparison.Ordinal);

        var empty = await PostFormAsync(Http, "/UpstreamTokens?handler=Save", ("system", "Workstream"), ("token", " "));
        Assert.Equal(HttpStatusCode.OK, empty.StatusCode);
        Assert.Contains("Enter the token.", await empty.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [MySqlFact]
    public async Task AFailedRequest_CanBeRetried_ButOnlyOnce_AndTheRetryIsRecordedWithTheAdminsName()
    {
        await SignInAsync();
        var client = await CreateClientAsync();
        await using var scope = _factory!.Services.CreateAsyncScope();
        var logs = scope.ServiceProvider.GetRequiredService<IRequestLogRepository>();
        var id = await logs.InsertAsync(
            new RequestLog { ClientRefId = client.Id, CorrelationId = Guid.NewGuid().ToString(), Url = "/x", Status = RequestStatus.Failed, EventType = "engineer-stats", CreatedOn = DateTimeOffset.UtcNow.AddHours(-3) },
            CancellationToken.None);
        await logs.InsertJsonAsync(new RequestLogJson { RequestLogId = id, Json = "{\"emails\":[\"jane@arbisoft.com\"]}" }, CancellationToken.None);
        var path = $"/RequestLogs/Details/{id}";
        Assert.Contains("Retry request", await Http.GetStringAsync(new Uri(path, UriKind.Relative)), StringComparison.Ordinal);

        var retried = await PostFormAsync(Http, path + "?handler=Retry");

        Assert.Equal(HttpStatusCode.Redirect, retried.StatusCode);
        var log = (await logs.GetByIdAsync(id, CancellationToken.None))!;
        Assert.Equal(RequestStatus.Queued, log.Status);
        Assert.NotNull(log.NextAttemptOn);
        var attempt = Assert.Single(await logs.GetAttemptsAsync(id, CancellationToken.None));
        Assert.Equal(("Retried", $"Admin: {PortalFactory.AdminUsername}"), (attempt.AttemptStatus, attempt.AttemptBy));

        var page = await Http.GetStringAsync(new Uri(path, UriKind.Relative));
        Assert.DoesNotContain("Retry request", page, StringComparison.Ordinal);
        Assert.Contains("Next attempt", page, StringComparison.Ordinal);
        var again = await PostFormAsync(Http, path + "?handler=Retry");
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Contains("Only a failed request can be retried.", await again.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [MySqlFact]
    public async Task TheIntegrationPages_AllRenderForASignedInAdmin()
    {
        await SignInAsync();
        var client = await CreateClientAsync();
        await PostFormAsync(Http, $"/ClientConfigs/Edit/{client.Id}", ("Form.AuthType", "ApiToken"), ("Form.BaseUrl", "https://sophia.example.com"), ("Form.ApiToken", "tok"), ("Form.MaxAttempts", "3"), ("Form.IsActive", "true"), ("Form.IsActive", "false"));
        await PostFormAsync(Http, $"/ClientConfigs/{client.Id}/Urls/Create", ("Form.EventType", "engineer-stats"), ("Form.Method", "POST"), ("Form.Path", "/cb/"), ("Form.IsActive", "true"), ("Form.IsActive", "false"));
        var owner = $"{Unique("pg")}@arbisoft.com".ToLowerInvariant();
        await PostFormAsync(Http, "/EmailMappings/Create", ("Form.ArbisoftEmail", owner), ("Form.Email", "x@gmail.com"));
        await using var scope = _factory!.Services.CreateAsyncScope();
        var mapping = Assert.Single((await scope.ServiceProvider.GetRequiredService<IEmailMappingRepository>().ListAsync(owner, 1, 10, CancellationToken.None)).Items);
        var configs = scope.ServiceProvider.GetRequiredService<IClientConfigRepository>();
        var url = Assert.Single(await configs.GetOutboundUrlsAsync((await configs.GetByClientRefIdAsync(client.Id, CancellationToken.None))!.Id, CancellationToken.None));

        var paths = new[]
        {
            "/EmailMappings", "/EmailMappings/Create", $"/EmailMappings/Edit/{mapping.Id}", "/ClientConfigs", $"/ClientConfigs/Details/{client.Id}", $"/ClientConfigs/Edit/{client.Id}",
            $"/ClientConfigs/{client.Id}/Urls/Create", $"/ClientConfigs/{client.Id}/Urls/{url.Id}/Edit", "/RequestLogs"
        };
        foreach (var path in paths)
        {
            var response = await Http.GetAsync(new Uri(path, UriKind.Relative));

            Assert.True(response.StatusCode == HttpStatusCode.OK, $"{path} answered {(int)response.StatusCode}.");
        }

        Assert.Equal(HttpStatusCode.NotFound, (await Http.GetAsync(new Uri("/ClientConfigs/Details/999999999", UriKind.Relative))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Http.GetAsync(new Uri("/EmailMappings/Edit/999999999", UriKind.Relative))).StatusCode);
    }

    [MySqlFact]
    public async Task AClient_CanBeEdited_AndItsScopesAssignedAndRemoved()
    {
        await SignInAsync();
        var client = await CreateClientAsync();
        await using var scope = _factory!.Services.CreateAsyncScope();
        var clients = scope.ServiceProvider.GetRequiredService<IClientRepository>();
        var statsScope = (await scope.ServiceProvider.GetRequiredService<IScopeRepository>().GetByNameAsync("stats:read", CancellationToken.None))!;

        var edited = await PostFormAsync(Http, $"/Clients/Edit/{client.Id}", ("Form.ClientId", client.ClientId), ("Form.Name", "Renamed"), ("Form.AccessTokenLifetimeSeconds", "1800"), ("Form.IsActive", "false"));
        Assert.Equal(HttpStatusCode.Redirect, edited.StatusCode);
        var after = (await clients.GetByIdAsync(client.Id, CancellationToken.None))!;
        Assert.Equal(("Renamed", 1800, false, PortalFactory.AdminUsername), (after.Name, after.AccessTokenLifetimeSeconds, after.IsActive, after.ModifiedBy));

        var bad = await PostFormAsync(Http, $"/Clients/Edit/{client.Id}", ("Form.ClientId", client.ClientId), ("Form.Name", "x"), ("Form.AccessTokenLifetimeSeconds", "5"), ("Form.IsActive", "true"));
        Assert.Equal(HttpStatusCode.OK, bad.StatusCode);
        Assert.Equal("Renamed", (await clients.GetByIdAsync(client.Id, CancellationToken.None))!.Name);

        var assigned = await PostFormAsync(Http, $"/Clients/Details/{client.Id}?handler=Scopes", ("ScopeIds", statsScope.Id.ToString(System.Globalization.CultureInfo.InvariantCulture)));
        Assert.Equal(HttpStatusCode.Redirect, assigned.StatusCode);
        Assert.Equal(["stats:read"], await clients.GetScopeNamesAsync(client.Id, CancellationToken.None));

        var unknown = await PostFormAsync(Http, $"/Clients/Details/{client.Id}?handler=Scopes", ("ScopeIds", "999999999"));
        Assert.Equal(HttpStatusCode.OK, unknown.StatusCode);
        Assert.Equal(["stats:read"], await clients.GetScopeNamesAsync(client.Id, CancellationToken.None));

        var cleared = await PostFormAsync(Http, $"/Clients/Details/{client.Id}?handler=Scopes");
        Assert.Equal(HttpStatusCode.Redirect, cleared.StatusCode);
        Assert.Empty(await clients.GetScopeNamesAsync(client.Id, CancellationToken.None));

        // Each saved change is in the client's history, newest first, with who made it; the refused edit and the unknown scope left nothing.
        var history = (await scope.ServiceProvider.GetRequiredService<IAuditLogRepository>().ListAsync(
            new AuditLogFilter(EntityType: "Client", EntityId: client.Id.ToString(CultureInfo.InvariantCulture)), 1, 50, CancellationToken.None)).Items;
        Assert.Equal(["ScopesChanged", "ScopesChanged", "Updated", "Created"], history.Select(entry => entry.Action));
        Assert.All(history, entry => Assert.Equal((AuditActorKind.User, PortalFactory.AdminUsername), (entry.ActorKind, entry.ActorName)));
        Assert.Contains("\"Renamed\"", history[2].Changes, StringComparison.Ordinal);
    }

    [MySqlFact]
    public async Task AClientSecret_CanBeRevoked_ButNotTwice()
    {
        await SignInAsync();
        var client = await CreateClientAsync();
        await PostFormAsync(Http, $"/Clients/{client.Id}/Secrets/Create", ("ValidForDays", "30"));
        await using var scope = _factory!.Services.CreateAsyncScope();
        var clients = scope.ServiceProvider.GetRequiredService<IClientRepository>();
        var secret = Assert.Single(await clients.GetSecretsAsync(client.Id, CancellationToken.None));
        var path = $"/Clients/{client.Id}/Secrets/{secret.Id}/Revoke";

        var revoked = await PostFormAsync(Http, path);
        Assert.Equal(HttpStatusCode.Redirect, revoked.StatusCode);
        Assert.NotNull(Assert.Single(await clients.GetSecretsAsync(client.Id, CancellationToken.None)).RevokedOn);

        var again = await PostFormAsync(Http, path);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Contains("already revoked", await again.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [MySqlFact]
    public async Task AScope_CanBeEdited_ButNotRenamedOntoAnExistingName()
    {
        await SignInAsync();
        var first = Unique("edit:").ToLowerInvariant();
        var second = Unique("edit:").ToLowerInvariant();
        await PostFormAsync(Http, "/Scopes/Create", ("Name", first), ("Description", "one"));
        await PostFormAsync(Http, "/Scopes/Create", ("Name", second), ("Description", "two"));
        await using var scope = _factory!.Services.CreateAsyncScope();
        var scopes = scope.ServiceProvider.GetRequiredService<IScopeRepository>();
        var stored = (await scopes.GetByNameAsync(first, CancellationToken.None))!;

        var clash = await PostFormAsync(Http, $"/Scopes/Edit/{stored.Id}", ("Name", second), ("Description", "x"));
        Assert.Equal(HttpStatusCode.OK, clash.StatusCode);
        Assert.Contains("already exists", await clash.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var renamed = await PostFormAsync(Http, $"/Scopes/Edit/{stored.Id}", ("Name", first), ("Description", "changed"));
        Assert.Equal(HttpStatusCode.Redirect, renamed.StatusCode);
        Assert.Equal("changed", (await scopes.GetByIdAsync(stored.Id, CancellationToken.None))!.Description);
    }

    [MySqlFact]
    public async Task AnAccessToken_IsRevokedWithAReasonThatRecordsWhoDidIt_ButNotTwice()
    {
        await SignInAsync();
        var client = await CreateClientAsync();
        await PostFormAsync(Http, $"/Clients/{client.Id}/Secrets/Create", ("ValidForDays", "30"));
        await PostFormAsync(Http, "/SigningKeys/Rotate");
        await using var scope = _factory!.Services.CreateAsyncScope();
        var clients = scope.ServiceProvider.GetRequiredService<IClientRepository>();
        var secret = Assert.Single(await clients.GetSecretsAsync(client.Id, CancellationToken.None));
        var key = (await scope.ServiceProvider.GetRequiredService<ISigningKeyRepository>().GetActiveAsync(DateTimeOffset.UtcNow, CancellationToken.None))!;
        var tokens = scope.ServiceProvider.GetRequiredService<IAccessTokenRepository>();
        var jti = Guid.NewGuid().ToString();
        await tokens.InsertAsync(
            new AccessTokenBuilder().WithJti(jti).ForClient(client.Id).IssuedWith(secret.Id, key.Id).Issued(DateTimeOffset.UtcNow, TimeSpan.FromHours(1)).Build(), CancellationToken.None);

        Assert.Contains(jti, await Http.GetStringAsync(new Uri("/AccessTokens", UriKind.Relative)), StringComparison.Ordinal);
        var path = $"/AccessTokens/Revoke/{jti}";
        Assert.Equal(HttpStatusCode.OK, (await Http.GetAsync(new Uri(path, UriKind.Relative))).StatusCode);

        var noReason = await PostFormAsync(Http, path, ("Reason", " "));
        Assert.Equal(HttpStatusCode.OK, noReason.StatusCode);
        Assert.Null((await tokens.GetByJtiAsync(jti, CancellationToken.None))!.RevokedOn);

        var revoked = await PostFormAsync(Http, path, ("Reason", "leaked in chat"));
        Assert.Equal(HttpStatusCode.Redirect, revoked.StatusCode);
        var stored = (await tokens.GetByJtiAsync(jti, CancellationToken.None))!;
        Assert.NotNull(stored.RevokedOn);
        Assert.Equal($"leaked in chat (revoked by {PortalFactory.AdminUsername})", stored.RevokedReason);

        var again = await PostFormAsync(Http, path, ("Reason", "again"));
        Assert.Contains("already revoked", await again.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.NotFound, (await Http.GetAsync(new Uri("/AccessTokens/Revoke/no-such-token", UriKind.Relative))).StatusCode);
    }

    [MySqlFact]
    public async Task TheErrorPage_RendersWithoutLeakingDetail()
    {
        await SignInAsync();

        var response = await Http.GetAsync(new Uri("/Error", UriKind.Relative));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("no-store", response.Headers.CacheControl!.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain("Exception", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [GeneratedRegex("name=\"__RequestVerificationToken\"[^>]*value=\"([^\"]+)\"")]
    private static partial Regex TokenPattern();

    [GeneratedRegex("<dd class=\"mono long\">([^<]+)</dd>")]
    private static partial Regex SecretPattern();
}
