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

using Arbisoft.DevLake.IntegrationService.API.Authorization;
using Arbisoft.DevLake.IntegrationService.API.BackgroundJobs;
using Arbisoft.DevLake.IntegrationService.API.Middleware;
using Arbisoft.DevLake.IntegrationService.API.OpenApi;
using Arbisoft.DevLake.IntegrationService.API.Portal;
using Arbisoft.DevLake.IntegrationService.API.RateLimiting;
using Arbisoft.DevLake.IntegrationService.Business;
using Arbisoft.DevLake.IntegrationService.DataAccess;
using Asp.Versioning;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// appsettings.Local.json holds one machine's real values (secrets, addresses). It is optional, git-ignored and kept out of the image, and it is read
// in every environment. Environment variables and command-line arguments are added again after it, so they still override it.
builder.Configuration
    .AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true)
    .AddEnvironmentVariables()
    .AddCommandLine(args);

builder.Host.UseSerilog((context, services, configuration) => configuration
    .ReadFrom.Configuration(context.Configuration)
    .ReadFrom.Services(services)
    .Enrich.FromLogContext());

// ValidateScopes defaults to on only in Development, so turn both on for every environment.
builder.Host.UseDefaultServiceProvider(options =>
{
    options.ValidateScopes = true;
    options.ValidateOnBuild = true;
});

// Sign-in cookies and anti-forgery tokens are protected with keys that must outlive the process, or every restart signs everyone out and
// invalidates open forms. Set DataProtection:KeysPath to a persistent directory (a volume) in any deployment; without it the keys stay local.
var keysPath = builder.Configuration["DataProtection:KeysPath"];
var dataProtection = builder.Services.AddDataProtection().SetApplicationName("integration-service");
if (!string.IsNullOrWhiteSpace(keysPath))
{
    dataProtection.PersistKeysToFileSystem(new DirectoryInfo(keysPath));
}

builder.Services.AddControllers();
builder.Services.AddRazorPages(options => options.Conventions.Add(new RequireEditorByDefaultConvention()));
builder.Services.AddProblemDetails(options =>
    options.CustomizeProblemDetails = context => context.ProblemDetails.Extensions["correlationId"] = context.HttpContext.TraceIdentifier);
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddApiAuthentication();
builder.Services.AddPortalAuthentication(builder.Configuration);
builder.Services.AddRateLimiting(builder.Configuration);
builder.Services.AddApiVersioning(options =>
{
    options.ApiVersionReader = new UrlSegmentApiVersionReader();
    options.ReportApiVersions = true;
}).AddMvc().AddApiDocumentation(builder.Configuration);
builder.Services.AddHealthChecks();
builder.Services.AddDataAccess(builder.Configuration);
builder.Services.AddBusiness(builder.Configuration);
builder.Services.AddHostedService<RequestProcessingJob>();

var app = builder.Build();

// Order is behaviour: exception handler, correlation ID, static files, API docs, routing, authentication, authorization, rate limiter.
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseMiddleware<CorrelationIdMiddleware>();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseStaticFiles();
app.UseApiDocumentation();
app.UseRouting();
app.UseAuthentication();
app.UseMiddleware<MustChangePasswordMiddleware>();
app.UseAuthorization();
app.UseRateLimiter();

app.MapControllers();
app.MapRazorPages();

// Liveness checks the process only; readiness gets the database and broker checks as they are added.
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") }).AllowAnonymous();

app.Run();

/// <summary>Entry point marker so tests can host the service with WebApplicationFactory.</summary>
public partial class Program;
