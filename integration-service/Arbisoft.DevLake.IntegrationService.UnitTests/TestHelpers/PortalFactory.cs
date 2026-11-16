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
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.TestHelpers;

/// <summary>
/// Hosts the real admin portal in-process against the test database, with a local administrator account (<see cref="AdminUsername"/>) in
/// PortalUsers that does not have to change its password, so tests can get straight to the pages.
/// </summary>
public sealed class PortalFactory : WebApplicationFactory<AuthController>
{
    public const string AdminUsername = "portal-admin";
    public const string AdminPassword = "a long test password";

    private readonly string _connectionString;
    private readonly IReadOnlyDictionary<string, string> _settings;

    public PortalFactory(string connectionString, IReadOnlyDictionary<string, string>? settings = null)
    {
        _connectionString = connectionString;
        _settings = settings ?? new Dictionary<string, string>();
    }

    /// <summary>Adds a local account with a password, as only the seeded administrator has in practice; tests use it to sign in with any role.</summary>
    public async Task<long> AddLocalUserAsync(string username, string password, string role, bool mustChangePassword = false)
    {
        await using var scope = Services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<IPortalUserRepository>();
        var id = await users.TryInsertAsync(
            new PortalUser
            {
                Username = username,
                PasswordHash = scope.ServiceProvider.GetRequiredService<IClientSecretHasher>().Hash(password),
                MustChangePassword = mustChangePassword,
                Role = role,
                IsActive = true,
                CreatedOn = DateTimeOffset.UtcNow,
                CreatedBy = "tests"
            },
            CancellationToken.None);
        return id ?? (await users.GetByUsernameAsync(username, CancellationToken.None))!.Id;
    }

    protected override IHost CreateHost(IHostBuilder builder)
    {
        var host = base.CreateHost(builder);
        AddAdminAsync(host.Services).GetAwaiter().GetResult();
        return host;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("Database:ConnectionString", _connectionString);
        builder.UseSetting("Security:EncryptionKey", SecurityTestData.NewEncryptionKey());
        builder.UseSetting("Security:Issuer", SecurityTestData.Issuer);
        builder.UseSetting("Security:Audience", SecurityTestData.Audience);
        // These tests drive the admin pages only, so the background processing stays off. The host still validates the broker settings at
        // startup and opens the connection only on use.
        builder.UseSetting("Processing:Enabled", "false");
        var broker = RabbitMqHarness.Settings;
        builder.UseSetting("RabbitMq:HostName", broker?["host"] ?? "localhost");
        builder.UseSetting("RabbitMq:Port", broker?["port"] ?? "5672");
        builder.UseSetting("RabbitMq:UserName", broker?["user"] ?? "user");
        builder.UseSetting("RabbitMq:Password", broker?["password"] ?? "pass");
        foreach (var (key, value) in _settings)
        {
            builder.UseSetting(key, value);
        }
    }

    /// <summary>The shared administrator account, created once for the whole test database (the first factory wins; later ones find it).</summary>
    private static async Task AddAdminAsync(IServiceProvider services)
    {
        await using var scope = services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<IPortalUserRepository>();
        if (await users.GetByUsernameAsync(AdminUsername, CancellationToken.None) is not null)
        {
            return;
        }

        await users.TryInsertAsync(
            new PortalUser
            {
                Username = AdminUsername,
                PasswordHash = scope.ServiceProvider.GetRequiredService<IClientSecretHasher>().Hash(AdminPassword),
                Role = PortalRole.Admin,
                IsActive = true,
                CreatedOn = DateTimeOffset.UtcNow,
                CreatedBy = "tests"
            },
            CancellationToken.None);
    }
}
