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
using Arbisoft.DevLake.IntegrationService.Business.Services.Admin;
using Arbisoft.DevLake.IntegrationService.Business.Services.Requests;
using Arbisoft.DevLake.IntegrationService.DataAccess.Models;
using Arbisoft.DevLake.IntegrationService.DataAccess.Repositories;
using Arbisoft.DevLake.IntegrationService.UnitTests.TestHelpers;
using Microsoft.Extensions.DependencyInjection;

namespace Arbisoft.DevLake.IntegrationService.UnitTests.API;

/// <summary>
/// The whole pipeline: a client's request goes in through the API, onto RabbitMQ, is picked up by the processing job, collected from a stubbed DevLake,
/// delivered to a stubbed Sophia, and shows up through the poll API. MySQL, RabbitMQ, the HTTP pipeline and the job are all real.
/// </summary>
[Collection(MySqlTestGroup.Name)]
public sealed class ProcessingEndToEndTests : ApiTestBase
{
    private const string Single = RequestEventTypes.EngineerStats;
    private const string Batch = RequestEventTypes.EngineerStatsBatch;

    private readonly UpstreamStub _upstream;

    public ProcessingEndToEndTests(MySqlDatabaseFixture database)
        : base(database, new Dictionary<string, string>
        {
            ["Processing:Enabled"] = "true",
            ["Processing:IntervalSeconds"] = "1",
            ["Processing:DeliveryRetryDelaySeconds"] = "1",
            ["Processing:UnavailableRetryDelaySeconds"] = "1",
            ["Resilience:RetryBaseDelayMilliseconds"] = "1",
            ["RateLimits:PollPerMinute"] = "100000"
        })
    {
        _upstream = new UpstreamStub(Upstream);
    }

    /// <summary>A client with callbacks for the given event types, and every other client's outbound config turned off.</summary>
    private async Task<(SeededClient Client, string Token)> IsolatedClientAsync(params string[] eventTypes)
    {
        var result = await ClientWithCallbacksAsync(eventTypes);
        await Seed.IsolateAsync(result.Client);
        return result;
    }

    private async Task<string> PollAsync(string token, string correlationId)
    {
        var response = await SendAsync(HttpMethod.Get, $"/api/v1/requests/poll/{correlationId}", token);
        return response.Json.GetProperty("status").GetString()!;
    }

    private static async Task WaitForAsync(Func<Task<bool>> condition, int seconds = 20)
    {
        await RabbitMqHarness.WaitUntilAsync(condition, seconds);
    }

    private async Task WaitForStatusAsync(string token, string correlationId, string expected)
    {
        await WaitForAsync(async () => await PollAsync(token, correlationId) == expected);
    }

    [BrokersFact]
    public async Task ASingleRequest_IsCollectedFromDevLake_DeliveredToSophia_AndReportedSuccess()
    {
        var (client, token) = await IsolatedClientAsync(Single);
        var jane = $"jane-{Guid.NewGuid():N}@arbisoft.com";
        var alias = $"jane.d-{Guid.NewGuid():N}@gmail.com";
        await Seed.SeedEmailMappingAsync(jane, alias);

        var request = await GetStatsAsync(token, jane, "24h");
        await WaitForStatusAsync(token, request.Correlation, "Success");

        var callback = Assert.Single(_upstream.Callbacks);
        Assert.Equal(HttpMethod.Post, callback.Method);
        Assert.Equal("https://sophia.test/api/v1/devlake/callback/", callback.AbsoluteUri);
        Assert.Equal("Bearer tok-1", callback.Authorization);
        Assert.Equal(request.Correlation, callback.CorrelationId);

        var body = JsonDocument.Parse(callback.Content!).RootElement;
        Assert.Equal(request.Correlation, body.GetProperty("correlation_id").GetString());
        Assert.Equal("24h", body.GetProperty("time_frame").GetString());
        var engineer = Assert.Single(body.GetProperty("engineers").EnumerateArray());
        Assert.Equal(jane, engineer.GetProperty("email").GetString());
        Assert.Equal(alias, Assert.Single(engineer.GetProperty("mapped_emails").EnumerateArray()).GetString());
        foreach (var (property, source) in new[] { ("jira", "jira"), ("github", "github"), ("ai_usage", "ai_usage"), ("ai_cost", "ai_cost") })
        {
            var stats = engineer.GetProperty(property);
            Assert.Equal(source, stats.GetProperty(jane).GetProperty("source").GetString());
            Assert.Equal(source, stats.GetProperty(alias).GetProperty("source").GetString());
        }

        var statsCalls = _upstream.DevLakeStatsRequests.ToList();
        Assert.Equal(8, statsCalls.Count);
        Assert.All(statsCalls, call =>
        {
            Assert.Equal("Bearer token", call.Authorization);
            Assert.Equal(request.Correlation, call.CorrelationId);
            Assert.EndsWith("?tf=24h", call.AbsoluteUri, StringComparison.Ordinal);
        });

        var log = (await Seed.LogAsync(request.Correlation))!;
        Assert.Equal(RequestStatus.Success, log.Status);
        var attempt = Assert.Single(await Seed.AttemptsAsync(log.Id));
        Assert.Equal("Delivered", attempt.AttemptStatus);
        Assert.Equal("RequestProcessor", attempt.AttemptBy);
        Assert.Null(attempt.FailureError);
        Assert.Contains("received", attempt.ResponseJson, StringComparison.Ordinal);
        Assert.Equal(0, await Seed.QueueDepthAsync());
        Assert.Single(await Seed.LogsForAsync(client));
    }

    [BrokersFact]
    public async Task ARangeRequest_AsksDevLakeForTheRange_AndDeliversFromAndTo()
    {
        var (_, token) = await IsolatedClientAsync(Single);

        var request = await SendAsync(HttpMethod.Get, $"/api/v1/engineers/{Encode("jane@arbisoft.com")}/stats?from={Uri.EscapeDataString("2026-11-01T00:00:00Z")}&to={Uri.EscapeDataString("2026-11-08T00:00:00Z")}", token);
        await WaitForStatusAsync(token, request.Correlation, "Success");

        Assert.All(_upstream.DevLakeStatsRequests, call => Assert.EndsWith("?from=2026-11-01T00%3A00%3A00Z&to=2026-11-08T00%3A00%3A00Z", call.AbsoluteUri, StringComparison.Ordinal));
        var body = JsonDocument.Parse(Assert.Single(_upstream.Callbacks).Content!).RootElement;
        Assert.Equal("2026-11-01T00:00:00Z", body.GetProperty("from").GetString());
        Assert.Equal("2026-11-08T00:00:00Z", body.GetProperty("to").GetString());
        Assert.False(body.TryGetProperty("time_frame", out _));
    }

    [BrokersFact]
    public async Task ABatch_IsProcessedForEveryEmail_AndDeliveredOnceWithOneEntryEach()
    {
        var (_, token) = await IsolatedClientAsync(Batch);
        var a = $"a-{Guid.NewGuid():N}@arbisoft.com";
        var b = $"b-{Guid.NewGuid():N}@arbisoft.com";
        await Seed.SeedEmailMappingAsync(b, $"bee-{Guid.NewGuid():N}@gmail.com");

        var request = await PostBatchAsync(token, new { emails = new[] { a, b }, timeFrame = "1w" });
        await WaitForStatusAsync(token, request.Correlation, "Success");

        var body = JsonDocument.Parse(Assert.Single(_upstream.Callbacks).Content!).RootElement;
        Assert.Equal([a, b], body.GetProperty("engineers").EnumerateArray().Select(e => e.GetProperty("email").GetString()));
        Assert.Equal(12, _upstream.DevLakeStatsRequests.Count());
    }

    [BrokersFact]
    public async Task WhenSophiaKeepsFailing_EveryAttemptIsRecorded_AndTheRequestEndsFailed()
    {
        var (_, token) = await IsolatedClientAsync(Single);
        _upstream.ScriptCallbacks(HttpStatusCode.InternalServerError, HttpStatusCode.InternalServerError, HttpStatusCode.InternalServerError, HttpStatusCode.InternalServerError);

        var request = await GetStatsAsync(token, "jane@arbisoft.com");
        await WaitForStatusAsync(token, request.Correlation, "Failure");

        Assert.Equal(3, _upstream.Callbacks.Count());
        var log = (await Seed.LogAsync(request.Correlation))!;
        var attempts = await Seed.AttemptsAsync(log.Id);
        Assert.Equal(3, attempts.Count);
        Assert.All(attempts, attempt =>
        {
            Assert.Equal("DeliveryFailed", attempt.AttemptStatus);
            Assert.Equal("HTTP 500", attempt.FailureError);
            Assert.Contains("sophia says no", attempt.ResponseJson, StringComparison.Ordinal);
        });
        Assert.Equal(0, await Seed.QueueDepthAsync());
    }

    [BrokersFact]
    public async Task ACallbackThatRejectsTheResult_EndsFailedAfterOneAttempt_WithoutRetrying()
    {
        var (_, token) = await IsolatedClientAsync(Single);
        _upstream.ScriptCallbacks(HttpStatusCode.BadRequest, HttpStatusCode.OK);

        var request = await GetStatsAsync(token, "jane@arbisoft.com");
        await WaitForStatusAsync(token, request.Correlation, "Failure");

        Assert.Single(_upstream.Callbacks);
        var attempt = Assert.Single(await Seed.AttemptsAsync((await Seed.LogAsync(request.Correlation))!.Id));
        Assert.Equal("HTTP 400", attempt.FailureError);
    }

    /// <summary>#10: a failed request is retried from the admin portal (no dead-letter shovelling) and delivered under its original correlation ID.</summary>
    [BrokersFact]
    public async Task AFailedRequest_RetriedByAnAdmin_IsProcessedAgain_AndDeliveredUnderItsOriginalCorrelationId()
    {
        var (_, token) = await IsolatedClientAsync(Single);
        _upstream.ScriptCallbacks(HttpStatusCode.BadRequest, HttpStatusCode.OK);
        var request = await GetStatsAsync(token, "jane@arbisoft.com");
        await WaitForStatusAsync(token, request.Correlation, "Failure");

        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var log = (await Seed.LogAsync(request.Correlation))!;
            var result = await scope.ServiceProvider.GetRequiredService<IRequestLogService>().RetryAsync(log.Id, "alice", CancellationToken.None);
            Assert.True(result.Succeeded);
        }

        await WaitForStatusAsync(token, request.Correlation, "Success");
        Assert.Equal([request.Correlation, request.Correlation], _upstream.Callbacks.Select(c => c.CorrelationId));
        var attempts = await Seed.AttemptsAsync((await Seed.LogAsync(request.Correlation))!.Id);
        Assert.Equal(["DeliveryFailed", "Retried", "Delivered"], attempts.Select(a => a.AttemptStatus));
    }

    [BrokersFact]
    public async Task ACallbackThatSaysTooManyRequests_IsTriedAgain_AndEndsSuccess()
    {
        var (_, token) = await IsolatedClientAsync(Single);
        _upstream.ScriptCallbacks(HttpStatusCode.TooManyRequests);

        var request = await GetStatsAsync(token, "jane@arbisoft.com");
        await WaitForStatusAsync(token, request.Correlation, "Success");

        var log = (await Seed.LogAsync(request.Correlation))!;
        Assert.Equal(["DeliveryFailed", "Delivered"], (await Seed.AttemptsAsync(log.Id)).Select(a => a.AttemptStatus));
    }

    [BrokersFact]
    public async Task ADeliveryThatFailsOnceThenWorks_EndsSuccess_WithBothAttemptsRecorded()
    {
        var (_, token) = await IsolatedClientAsync(Single);
        _upstream.ScriptCallbacks(HttpStatusCode.BadGateway);

        var request = await GetStatsAsync(token, "jane@arbisoft.com");
        await WaitForStatusAsync(token, request.Correlation, "Success");

        var log = (await Seed.LogAsync(request.Correlation))!;
        Assert.Equal(["DeliveryFailed", "Delivered"], (await Seed.AttemptsAsync(log.Id)).Select(a => a.AttemptStatus));
        Assert.Equal(2, _upstream.Callbacks.Count());
        Assert.Single(_upstream.SophiaTokenRequests);
    }

    [BrokersFact]
    public async Task TheNumberOfDeliveryAttempts_ComesFromTheClientsConfig()
    {
        var client = await Seed.SeedClientAsync();
        await Seed.SeedSophiaAsync(client, maxAttempts: 1, Single);
        await Seed.IsolateAsync(client);
        var token = await ApiSeed.RequestTokenAsync(Http, client);
        _upstream.ScriptCallbacks(HttpStatusCode.InternalServerError, HttpStatusCode.InternalServerError);

        var request = await GetStatsAsync(token, "jane@arbisoft.com");
        await WaitForStatusAsync(token, request.Correlation, "Failure");

        Assert.Single(_upstream.Callbacks);
    }

    [BrokersFact]
    public async Task WhenDevLakeRejectsOurToken_RequestsStayQueuedUntouched_ThenCompleteOnceItIsFixed()
    {
        var (_, token) = await IsolatedClientAsync(Single);
        _upstream.DevLakeTokenValid = false;

        var request = await GetStatsAsync(token, "jane@arbisoft.com");
        await WaitForAsync(async () => _upstream.DevLakeTokenChecks.Count() >= 2);

        Assert.Equal("Queued", await PollAsync(token, request.Correlation));
        Assert.Equal(1, await Seed.QueueDepthAsync());
        Assert.Empty(_upstream.DevLakeStatsRequests);
        Assert.Empty(_upstream.Callbacks);
        var message = (await Seed.LogAsync(request.Correlation))!;
        Assert.Empty(await Seed.AttemptsAsync(message.Id));

        _upstream.DevLakeTokenValid = true;
        await WaitForStatusAsync(token, request.Correlation, "Success");
        Assert.Equal(0, await Seed.QueueDepthAsync());
    }

    [BrokersFact]
    public async Task WhenSophiaRefusesOurCredentials_TheRequestWaitsQueuedInTheDatabase_WithoutCallingDevLake_ThenCompletesOnceItIsFixed()
    {
        var (_, token) = await IsolatedClientAsync(Single);
        _upstream.SophiaTokenStatus = HttpStatusCode.Unauthorized;

        var request = await GetStatsAsync(token, "jane@arbisoft.com");
        await WaitForAsync(async () => _upstream.SophiaTokenRequests.Count() >= 2);
        await WaitForAsync(async () => await Seed.LogAsync(request.Correlation) is { Status: RequestStatus.Queued, NextAttemptOn: not null });

        Assert.Equal(0, await Seed.QueueDepthAsync());
        Assert.Empty(_upstream.DevLakeStatsRequests);
        Assert.Empty(await Seed.AttemptsAsync((await Seed.LogAsync(request.Correlation))!.Id));

        _upstream.SophiaTokenStatus = HttpStatusCode.OK;
        await WaitForStatusAsync(token, request.Correlation, "Success");
    }

    [BrokersFact]
    public async Task ACallbackRemovedWhileTheRequestWaits_RevokesIt_WithoutCallingDevLake()
    {
        var (client, token) = await IsolatedClientAsync(Single);
        _upstream.DevLakeTokenValid = false;
        var request = await GetStatsAsync(token, "jane@arbisoft.com");
        await WaitForAsync(async () => _upstream.DevLakeTokenChecks.Any());

        await Seed.DeactivateCallbackUrlAsync(client, Single);
        _upstream.DevLakeTokenValid = true;
        await WaitForStatusAsync(token, request.Correlation, "Revoked");

        Assert.Empty(_upstream.DevLakeStatsRequests);
        Assert.Empty(_upstream.Callbacks);
        Assert.Equal(RequestStatus.RevokedNoCallbackUrl, (await Seed.LogAsync(request.Correlation))!.Status);
        Assert.Equal(0, await Seed.QueueDepthAsync());
    }

    [BrokersFact]
    public async Task WhenDevLakeRefusesAMappedEmail_TheOtherStatsAreStillDelivered_WithTheRefusalListedPerSource()
    {
        var (_, token) = await IsolatedClientAsync(Single);
        var jane = $"jane-{Guid.NewGuid():N}@arbisoft.com";
        var alias = $"jane.d-{Guid.NewGuid():N}@gmail.com";
        await Seed.SeedEmailMappingAsync(jane, alias);
        _upstream.DevLakeStats = email => email == alias ? HttpStatusCode.NotFound : HttpStatusCode.OK;

        var request = await GetStatsAsync(token, jane);
        await WaitForStatusAsync(token, request.Correlation, "Success");

        var engineer = Assert.Single(JsonDocument.Parse(Assert.Single(_upstream.Callbacks).Content!).RootElement.GetProperty("engineers").EnumerateArray());
        foreach (var source in new[] { "jira", "github", "ai_usage", "ai_cost" })
        {
            Assert.True(engineer.GetProperty(source).TryGetProperty(jane, out _));
            Assert.False(engineer.GetProperty(source).TryGetProperty(alias, out _));
        }

        var errors = engineer.GetProperty("errors").EnumerateArray().ToList();
        Assert.Equal(4, errors.Count);
        Assert.All(errors, error =>
        {
            Assert.Equal(alias, error.GetProperty("email").GetString());
            Assert.Equal(404, error.GetProperty("status").GetInt32());
        });
    }

    [BrokersFact]
    public async Task OneEngineerDevLakeRefuses_DoesNotAffectTheOtherRequests()
    {
        var (_, token) = await IsolatedClientAsync(Single);
        _upstream.DevLakeStats = email => email.StartsWith("bad", StringComparison.Ordinal) ? HttpStatusCode.NotFound : HttpStatusCode.OK;

        var bad = await GetStatsAsync(token, "bad@arbisoft.com");
        var good = await Task.WhenAll(Enumerable.Range(1, 4).Select(i => GetStatsAsync(token, $"good{i}@arbisoft.com")));
        foreach (var request in good.Append(bad))
        {
            await WaitForStatusAsync(token, request.Correlation, "Success");
        }

        Assert.Equal(5, _upstream.Callbacks.Count());
        var errorsPerRequest = _upstream.Callbacks.ToDictionary(
            callback => callback.CorrelationId!,
            callback => JsonDocument.Parse(callback.Content!).RootElement.GetProperty("engineers")[0].GetProperty("errors").GetArrayLength());
        Assert.Equal(4, errorsPerRequest[bad.Correlation]);
        Assert.All(good, request => Assert.Equal(0, errorsPerRequest[request.Correlation]));
        Assert.Equal(0, await Seed.QueueDepthAsync());
    }

    [BrokersFact]
    public async Task ManyRequestsAtOnce_AreAllDelivered_ExactlyOnceEach()
    {
        var (_, token) = await IsolatedClientAsync(Single);

        var requests = await Task.WhenAll(Enumerable.Range(1, 12).Select(i => GetStatsAsync(token, $"engineer{i}@arbisoft.com")));
        foreach (var request in requests)
        {
            await WaitForStatusAsync(token, request.Correlation, "Success");
        }

        var delivered = _upstream.Callbacks.Select(c => JsonDocument.Parse(c.Content!).RootElement.GetProperty("correlation_id").GetString()).ToList();
        Assert.Equal(12, delivered.Count);
        Assert.Equal(requests.Select(r => r.Correlation).Order(), delivered.Order());
    }

    [BrokersFact]
    public async Task ARepeatDeliveryOfAFinishedRequest_IsAcknowledged_WithoutDeliveringAgain()
    {
        var (_, token) = await IsolatedClientAsync(Single);
        var request = await GetStatsAsync(token, "jane@arbisoft.com");
        await WaitForStatusAsync(token, request.Correlation, "Success");
        var body = JsonSerializer.Serialize(new { correlation_id = request.Correlation, event_type = Single, emails = new[] { "jane@arbisoft.com" }, time_frame = "24h", requested_on = DateTimeOffset.UtcNow });

        await RabbitMqHarness.PublishRawAsync(Factory.QueueName, request.Correlation, Single, body);
        await WaitForAsync(async () => await Seed.QueueDepthAsync() == 0);
        await Task.Delay(1500);

        Assert.Single(_upstream.Callbacks);
        Assert.Equal(4, _upstream.DevLakeStatsRequests.Count());
    }

    [BrokersFact]
    public async Task AMessageWhoseLogRowDoesNotExist_IsDeadLettered_AndNotProcessed()
    {
        var (_, _) = await IsolatedClientAsync(Single);
        var correlationId = Guid.NewGuid().ToString("D");
        var body = JsonSerializer.Serialize(new { correlation_id = correlationId, event_type = Single, emails = new[] { "ghost@arbisoft.com" }, time_frame = "24h", requested_on = DateTimeOffset.UtcNow });

        await RabbitMqHarness.PublishRawAsync(Factory.QueueName, correlationId, Single, body);

        // The queue depth counts only messages waiting to be taken, so it reads 0 while the job still holds this one: wait for the dead-letter queue.
        var dead = new List<DrainedMessage>();
        await WaitForAsync(async () =>
        {
            dead.AddRange(await RabbitMqHarness.DrainAsync(Factory.QueueName + ".dead"));
            return dead.Count > 0;
        });

        Assert.Equal(correlationId, Assert.Single(dead).CorrelationId);
        Assert.Equal(0, await Seed.QueueDepthAsync());
        Assert.Empty(_upstream.DevLakeStatsRequests);
        Assert.Empty(_upstream.Callbacks);
    }

    /// <summary>The outbox relay: the API committed the request but stopped before publishing it, so there is no message, only the Received row.</summary>
    [BrokersFact]
    public async Task ARequestRecordedButNeverPublished_IsPublishedAgainByTheJob_AndDelivered()
    {
        var (client, token) = await IsolatedClientAsync(Single);
        var correlationId = await Seed.SeedRequestAsync(client, RequestStatus.Received);
        var log = (await Seed.LogAsync(correlationId))!;
        var body = JsonSerializer.Serialize(new
        {
            correlation_id = correlationId,
            event_type = Single,
            emails = new[] { $"relay-{Guid.NewGuid():N}@arbisoft.com" },
            time_frame = "24h",
            requested_on = DateTimeOffset.UtcNow
        });
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<IRequestLogRepository>().InsertJsonAsync(new RequestLogJson { RequestLogId = log.Id, Json = body }, CancellationToken.None);
        }

        await Seed.ExecuteAsync("UPDATE RequestLogs SET createdOn = @old WHERE id = @id", new { old = DateTime.UtcNow.AddMinutes(-2), id = log.Id });

        await WaitForStatusAsync(token, correlationId, "Success");
        Assert.Equal(correlationId, Assert.Single(_upstream.Callbacks).CorrelationId);
    }

    /// <summary>A worker that stopped mid-step (a crash) leaves the request Processing with a lease and no message; once the lease runs out the job resumes it.</summary>
    [BrokersFact]
    public async Task ARequestLeftByAWorkerThatStopped_IsPickedUpAgainOnceItsLeaseRunsOut()
    {
        var (client, token) = await IsolatedClientAsync(Single);
        var correlationId = await Seed.SeedRequestAsync(client, RequestStatus.Processing);
        var log = (await Seed.LogAsync(correlationId))!;
        var body = JsonSerializer.Serialize(new
        {
            correlation_id = correlationId,
            event_type = Single,
            emails = new[] { $"crash-{Guid.NewGuid():N}@arbisoft.com" },
            time_frame = "24h",
            requested_on = DateTimeOffset.UtcNow
        });
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<IRequestLogRepository>().InsertJsonAsync(new RequestLogJson { RequestLogId = log.Id, Json = body }, CancellationToken.None);
        }

        await Seed.ExecuteAsync("UPDATE RequestLogs SET claimedUntil = @expired WHERE id = @id", new { expired = DateTime.UtcNow.AddMinutes(-1), id = log.Id });

        await WaitForStatusAsync(token, correlationId, "Success");
        Assert.Equal(correlationId, Assert.Single(_upstream.Callbacks).CorrelationId);
    }

    [BrokersFact]
    public async Task ARequestStillHeldByAWorker_IsLeftAlone()
    {
        var (client, token) = await IsolatedClientAsync(Single);
        var correlationId = await Seed.SeedRequestAsync(client, RequestStatus.Processing);
        var log = (await Seed.LogAsync(correlationId))!;
        await Seed.ExecuteAsync("UPDATE RequestLogs SET claimedUntil = @held WHERE id = @id", new { held = DateTime.UtcNow.AddMinutes(10), id = log.Id });

        await Task.Delay(3500);

        Assert.Equal("Processing", await PollAsync(token, correlationId));
        Assert.Empty(_upstream.Callbacks);
    }

    [BrokersFact]
    public async Task ARequestLeftUnfinishedPastTheQueueLifetime_IsMarkedFailed_SoPollingDoesNotSayQueuedForever()
    {
        var (client, token) = await IsolatedClientAsync(Single);
        var correlationId = await Seed.SeedRequestAsync(client, RequestStatus.Queued);
        await Seed.ExecuteAsync("UPDATE RequestLogs SET createdOn = @old, queuedOn = @old WHERE correlationId = @id", new { old = DateTime.UtcNow.AddHours(-3), id = correlationId });

        await WaitForStatusAsync(token, correlationId, "Failure");

        var attempt = Assert.Single(await Seed.AttemptsAsync((await Seed.LogAsync(correlationId))!.Id));
        Assert.Equal("Expired", attempt.AttemptStatus);
        Assert.Contains("expired", attempt.FailureError, StringComparison.Ordinal);
    }

    [BrokersFact]
    public async Task WithAnEmptyQueue_TheJobDoesNotEvenCheckDevLake()
    {
        await Task.Delay(3500);

        Assert.Empty(_upstream.DevLakeTokenChecks);
        Assert.Empty(_upstream.SophiaTokenRequests);
    }

    [BrokersFact]
    public async Task EveryCallToDevLakeAndSophia_CarriesTheRequestsCorrelationId()
    {
        var (_, token) = await IsolatedClientAsync(Single);
        var request = await GetStatsAsync(token, "private.person@arbisoft.com");
        await WaitForStatusAsync(token, request.Correlation, "Success");

        Assert.All(_upstream.DevLakeStatsRequests.Concat(_upstream.Callbacks), call => Assert.Equal(request.Correlation, call.CorrelationId));
    }
}
