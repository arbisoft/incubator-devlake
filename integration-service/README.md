<!--
Licensed to the Apache Software Foundation (ASF) under one or more
contributor license agreements.  See the NOTICE file distributed with
this work for additional information regarding copyright ownership.
The ASF licenses this file to You under the Apache License, Version 2.0
(the "License"); you may not use this file except in compliance with
the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

# Integration Service

A .NET 10 service that sits between DevLake and third-party systems such as Sophia and Workstream. The design is in `integration-service-architecture-plan.md` (PR #140).

## Layout

Each layer references only the layer directly below it.

| Project | Role |
|---|---|
| `Arbisoft.DevLake.IntegrationService.API` | Controllers, authorization, rate limiting, background jobs |
| `Arbisoft.DevLake.IntegrationService.Web` | Razor Pages admin portal |
| `Arbisoft.DevLake.IntegrationService.Business` | Services, DTOs, token and encryption logic |
| `Arbisoft.DevLake.IntegrationService.DataAccess` | Models, Dapper repositories, SQL migrations (DbUp), external API clients, RabbitMQ |
| `Arbisoft.DevLake.IntegrationService.UnitTests` | xUnit tests |

Deviations from the team's .NET guidelines are recorded in `dotnet-dev.exceptions.md`.

## Run locally

Start MySQL (port 3308) and RabbitMQ (ports 5672 and 15672):

```sh
cp env.example .env   # then edit the values
docker compose up -d
```

Settings live in each project's `appsettings.json`. Secrets are never put there. Set them as environment variables, using `__` for nesting:

```sh
export Database__ConnectionString="Server=127.0.0.1;Port=3308;Database=integration;User=integration;Password=<password>"
export RabbitMq__UserName=<user> RabbitMq__Password=<password>
export DevLake__ApiToken=<token> Workstream__ApiToken=<token>
export Security__EncryptionKey=$(openssl rand -base64 32)   # keep it: it decrypts the stored secrets
dotnet run --project Arbisoft.DevLake.IntegrationService.API
```

The host refuses to start if a required setting is missing or `Security__EncryptionKey` is not 32 bytes of base64.

Private signing keys are stored AES-256-GCM encrypted in the `SecretStoreEntries` table, named by `SigningKeys.privateKeyRef`. An environment variable `Secrets__<privateKeyRef>` overrides the stored copy, so a deployment can keep a key in a vault instead. If the master key is lost, rotate to a new signing key: tokens signed with the old one still verify because public keys are in the database.

### Mock Sophia

`dev/mock_sophia.py` (Python 3, standard library only) stands in for Sophia on both sides, so the whole flow can be run locally:

- **As Sophia the client** it gets a bearer token from `POST /auth/token/` with OAuth2 client credentials, sends single-email and batch stats requests, and polls each one.
- **As Sophia the callback receiver** it runs its own OAuth2 client-credentials token endpoint and a callback endpoint that accepts only tokens it issued, the way the real Sophia does. Every callback is recorded and matched to its request.

It serves, by default on `http://127.0.0.1:5097/sophia`: `POST /oauth2/token/`, `POST /api/v1/devlake/callback/` (also PUT and PATCH) and `GET /callbacks` (what it received, newest first).

Set it up once in the admin portal, for the client Sophia uses (for example `sophia-local`):

1. **Client:** active, with the `stats:read` scope and a secret. The secret is shown once; put it in `SOPHIA_CLIENT_SECRET` and the Client ID in `SOPHIA_CLIENT_ID`.
2. **Outbound config:** auth type OAuth2 client credentials, base URL `http://127.0.0.1:5097/sophia`, token URL `http://127.0.0.1:5097/sophia/oauth2/token/`, and as outbound client ID and secret the values of `SOPHIA_OUTBOUND_CLIENT_ID` and `SOPHIA_OUTBOUND_CLIENT_SECRET` (the mock accepts only these at its token endpoint).
3. **Callback URLs:** `engineer-stats` and `engineer-stats-batch`, both `POST` to `/api/v1/devlake/callback/`.

Then, with the API running on `http://localhost:5099` and DevLake reachable:

```sh
set -a; . ./.env; set +a
python3 dev/mock_sophia.py run --emails jane@arbisoft.com,john@arbisoft.com --singles 4 --batches 1 --tf 1w
```

Instead of `--emails`, `--emails-from-devlake N` uses the N most active engineers in the local DevLake database: `@arbisoft.com` emails (`--email-domain`) that appear as commit authors, Jira or GitHub accounts, or in AI usage, ranked by how much activity each has, leaving out any the Integration Service would refuse. It reads them with a read-only query through the MySQL client in DevLake's container (`devlake-mysql-1`, database `lake`, user `merico`), taking the password from `DB_URL` in the repository root's `.env`; `--devlake-container`, `--devlake-password` and `--devlake-env` change that. Each batch takes the next group of up to 20 emails, the batch API's limit:

```sh
python3 dev/mock_sophia.py run --emails-from-devlake 25 --singles 5 --batches 2
```

It prints each acknowledgement, every token request and callback it receives, and a report per request (poll status, callbacks received, engineers, `errors`). It exits 0 when every request ended `Success` with an accepted callback, and 1 otherwise. Identical requests inside the duplicate window come back with the original correlation ID; the report notes it.

Useful options: `--from`/`--to` instead of `--tf` for single requests; `--callback-statuses 503,429,400` answers the first callbacks with those statuses (then 200) to watch the retry rules, with `--retry-after N` sent on a 429 or 503; `--token-lifetime` for how long its tokens last; `--verbose` prints every callback body. `python3 dev/mock_sophia.py serve` runs only the Sophia side, to drive requests some other way (for example Swagger). `--help` lists the rest. The client, outbound and service settings can also be given as `--client-id`, `--outbound-client-id`, `--service-url` and so on instead of the environment.

Health endpoints: `/health/live` and `/health/ready`. Readiness checks MySQL and RabbitMQ.

Run **one instance of the API**. Several things live in the process, not in shared state: the rate limits, the cap on concurrent DevLake calls (`DevLake:MaxConcurrentRequests`), the cache of Sophia access tokens, and the processing job. A second instance would double every limit, and its job's stale-request sweep could mark `Failed` a request the other instance is still delivering. The admin portal can run separately; it does not process requests.

## Admin portal

The portal (`Arbisoft.DevLake.IntegrationService.Web`) manages the auth side of the service. It shares the API's database and the same `Database__*`, `RabbitMq__*` and `Security__*` settings, and it never processes requests. It signs in one admin account from configuration; the password is stored only as a hash:

```sh
echo -n "<password>" | dotnet run --project Arbisoft.DevLake.IntegrationService.Web -- hash-password   # prints the hash
export Admin__Username=<name> Admin__PasswordHash=<hash>
dotnet run --project Arbisoft.DevLake.IntegrationService.Web
```

Every page needs the sign-in (the fallback policy is deny), POSTs need an anti-forgery token, sign-in attempts are limited to 10 a minute per address, and the cookie is HttpOnly, SameSite=Strict and lasts 8 hours of activity. With no admin configured, nobody can sign in. Each change records the admin's name as `createdBy` or `modifiedBy`.

- **Clients:** list, create, edit and view details, including the active flag and token lifetime (60 to 86,400 seconds). The Client ID never changes.
- **Client secrets:** create one (1 to 730 days) and it is shown once; only a hash is stored. Revoke any of them; the unexpired tokens issued with that secret are revoked in the same transaction, so a leaked secret's tokens stop working at once. Every API call also checks, in the same query that checks the token and its client, that the token's secret is not revoked, so a token issued at the moment its secret was revoked is refused too. A client can hold several, so a secret can be rotated without downtime. Share new credentials through Passbolt.
- **Scopes:** list, create and edit, and assign them to a client on its details page. Taking a scope away from a client also revokes the client's unexpired tokens, because they still carry it; the client's next token has its current scopes.
- **Signing keys:** list the keys and rotate the active one. Rotation generates an RSA key, stores the private half encrypted, activates the new key and retires the old one in one transaction. Retired keys stay, so tokens already issued keep verifying until they expire.
- **Access tokens:** list the 200 most recent and revoke one with a reason. The reason also records who revoked it, because the table has no "revoked by" column.

- **Email mappings:** list (50 a page, with search), create and edit the other emails each engineer commits with. Both addresses are trimmed and lower-cased by `EmailNormalizer` before they are compared or stored, the Arbisoft address must be in `Requests:AllowedEmailDomains`, and the mapped address is also kept as typed. The matched columns use a binary collation, so SQL compares exactly what the code compares.
- **Outbound configs:** one per client. Choose OAuth2 client credentials or a static API token, the base URL (HTTPS; plain HTTP only for localhost), max delivery attempts (1 to 10) and the active flag. Secrets are encrypted before they are stored and are never shown again: leave a field blank to keep the stored value, or type a new one to rotate it. The page shows whether one is stored, when it was last rotated and, for a token, when it expires. Fields for the other auth type are cleared on save.
- **Callback URLs:** for each config, the event type to method and path mappings. The path is appended to the base URL, keeping the base URL's own path (`https://sophia.example.com/api/v1` and `/cb` call `https://sophia.example.com/api/v1/cb`), and the config page shows the full URL each one calls. The path is checked with the same code that builds the calls, so it must start with a single `/` and stay on the base URL's host. Only one URL can be active per event type.
- **Request logs:** filter by client, status and UTC dates (50 a page), and open a request to see its JSON body, when a waiting request is next due, and every delivery attempt with the client's response. The body holds engineer emails, so it is shown only here. A `Failed` request with a stored body has a **Retry** button for when the cause is fixed (a broken callback, DevLake down for hours, an expired request): it goes back to `Queued`, due at once, keeps its correlation ID so the client receives it as the original request, and gets a fresh two-hour lifetime and a fresh set of delivery attempts; its stats are collected again. The retry is listed in the attempt history as `Retried` with the admin's name. `createdOn` keeps when the client sent the request; `queuedOn` is when it last entered processing, and the lifetime and the attempt count are measured from it.

The client, scope, key and token lists show at most 200 rows.

## Request queue

Stats requests wait in a durable RabbitMQ quorum queue (`RabbitMq:RequestQueueName`). Messages are persistent, carry the correlation ID and a `schema-version` header, and are confirmed by the broker before the API answers.

The API records a request before it publishes it (an outbox): it commits the `RequestLogs` row and its body as `Received`, returns its database connection to the pool, publishes, and only then marks the row `Queued`. So a message always has a row, and a caller disconnecting after the commit cannot undo it. If the process stops between the commit and the publish, the processing job publishes the `Received` row again (see below).

| Setting | Default | Effect |
|---|---|---|
| `QueueMaxLength` | 10000 | When the queue is full the broker rejects the publish and the API answers 429 |
| `PublishTimeoutSeconds` | 10 | The longest one publish may take, including waiting for the publish channel and the broker's confirm. A slower publish counts as the broker being unavailable (503), so a broker that blocks publishers cannot hold API requests open |
| `MessageTtlSeconds` | 7200 | A request that waits longer expires into the dead-letter queue |
| `DeliveryLimit` | 5 | A message redelivered more often than this is moved to the dead-letter queue, and its request is marked `Failed` with the reason |

Rejected, expired and unreadable messages go to `<queue>.dead` through the `<queue>.dlx` exchange. Inspect them in the RabbitMQ management UI (http://localhost:15672). Their requests are already `Failed`, so a message moved back to the request queue is acknowledged and dropped: do not shovel them back. To run a failed request again, use **Retry** on its page in the admin portal (below), then purge the dead-letter queue when you no longer need its messages.

## Stats requests

`GET /api/v1/engineers/{email}/stats?tf=24h` and `POST /api/v1/engineers/stats/batch` (body `{ "emails": [...], "timeFrame": "24h" }`, up to 20 emails) need the `stats:read` scope. Both are asynchronous: they log the request, queue it and return a `correlation_id` at once, and the result is posted later to the client's callback URL.

- **Time frame:** a whole number from 1 to 999 and a case-sensitive unit: `h`, `d`, `w`, `M` or `y`, for example `24h`, `1w`, `30d`, `11M`, `1y`. The longest is one year (for that check a month counts as 30 days and a year as 365). The window itself counts back from when the request was made, in calendar months and years, the way DevLake does.
- **Date range:** instead of `tf`, the single-email API takes `from` and `to`, for example `GET /api/v1/engineers/{email}/stats?from=2026-11-01T00:00:00Z&to=2026-11-08T00:00:00Z`. Give a time frame or a range, never both, and always both ends of a range. Timestamps are ISO 8601 with a time and an explicit offset (`Z` or `+05:00`; write the `+` as `%2B` in a URL). A date with no time or offset is rejected because it would depend on a time zone. They are converted to UTC at second precision, `from` must be earlier than `to`, and the range can be at most one year. The queued request carries `from` and `to` instead of `time_frame`.
- **Emails** are trimmed and lower-cased, and must be in an allowed domain. Raw emails are never written to logs or error responses.
- **No callback URL:** when the client has no active outbound URL for the event type (`engineer-stats` or `engineer-stats-batch`), the request is logged as `Revoked - no callback URL`, nothing is queued, and the API answers 422 with that reason in `error`.
- **Duplicates:** an identical request (same client, emails and time frame) inside the duplicate window returns the original acknowledgement. A unique key in the database is what prevents the duplicate, so concurrent identical requests also produce one. Revoked and failed requests never block a repeat.
- **Queue problems:** 429 with `Retry-After` when the queue is full, 503 with `Retry-After` when the broker is unreachable or does not confirm within `RabbitMq:PublishTimeoutSeconds`. The request is recorded as `Failed` with a `PublishFailed` attempt giving the reason, and it gives up its idempotency key, so the client's retry is queued as a new request. If a publish that timed out did reach the queue, the job finds the request `Failed` and drops the message.

## Processing requests

A background job in the API takes queued stats requests off RabbitMQ, collects the stats from DevLake, and delivers them to the client's callback. It is on by default and can be turned off with `Processing:Enabled=false` (requests then stay queued).

Once the job takes a request off the queue, its `RequestLogs` row owns it and the message is acknowledged. A request that has to wait (a failed delivery, refused client credentials, DevLake down) is deferred in the database to `nextAttemptOn`, so it never sleeps in memory, never blocks other requests, and never uses up its message's redeliveries. A worker claims a request with a lease (`claimedUntil`) through an `UPDATE` that only one worker can win, so a duplicate message or a second worker never does the work twice, and a request whose worker stopped (a crash) is picked up again once its lease runs out.

Every `Processing:IntervalSeconds` (30) a run does this, in order:

1. Marks requests that did not finish within the queue's message lifetime plus `Processing:StaleGraceSeconds` of entering processing (`queuedOn`) as `Failed`, with an `Expired` attempt, so polling does not say `Queued` forever. A request a worker currently holds is left alone.
2. Publishes again the requests still `Received` more than `Processing:RepublishAfterSeconds` (60) after they were recorded: the API committed them but never published them. It stops at the first refusal from the broker and tries again next run.
3. Lists the requests the database has due (deferred until now, or left by a worker that stopped). If there are none and the queue is empty, it does nothing more.
4. Checks that DevLake answers and accepts our API token. If not, nothing is taken.
5. Takes work one item per free worker, `Processing:MaxParallelRequests` (4) at a time: first the due requests, then messages from the queue. It keeps going until the queue is empty, `Processing:RunBudgetSeconds` (120) is used, or DevLake fails during the run. Nothing is taken that cannot be started at once, so no message is put back unworked.

Each item is one step of work on one request:

- A message the consumer rejects (unknown schema version, no correlation ID, delivered more than `RabbitMq:DeliveryLimit` times) is dead-lettered, and its request is marked `Failed` with the reason. A message whose request has no `RequestLogs` row is dead-lettered too, because the API always records the row before it publishes.
- A message for a request that is finished, or that the job already owns, is acknowledged and nothing else happens, so a repeat never delivers twice.
- A request whose callback was removed while it waited is marked `Revoked - no callback URL`.
- If its stats are not collected yet, the job first makes sure a Sophia access token can be had for the client. If the client's credentials are refused, that client is marked failing for the rest of the run: this and its other requests wait `Processing:UnavailableRetryDelaySeconds` (60) as `Queued`, DevLake is not called for them, and every other client carries on. Then it loads the engineer's mapped emails, fetches Jira, GitHub, AI usage and AI cost for the Arbisoft email and every mapped email at once, and stores the merged body in `RequestPayloads`, so every delivery attempt sends the same result.
- It makes one delivery attempt and records it in `RequestResponseAttempts`. Delivered ends the request `Success`. Only answers that may pass are retried: an unreachable callback, 408, 429 or any 5xx defers the request as `Processing` by `Processing:DeliveryRetryDelaySeconds` (30), doubling after each failure, or by the callback's `Retry-After` when that is longer, never more than `Processing:MaxDeliveryRetryDelaySeconds` (900), until the client's `maxAttempts` is used and it ends `Failed`. Any other 4xx (400, 404, 422, ...) means the callback refuses this result, so the request ends `Failed` at once with the status recorded. With the defaults, ten attempts fit in the two hours a request may live. Credentials refused by the callback make the client failing and defer the request without counting an attempt.
- The stored body is deleted once the request finishes.

One failing request never stops the others. DevLake down, or refusing our token, during a run stops the run taking new work; the request that hit it waits `Processing:UnavailableRetryDelaySeconds`, and the next run tries again. A call DevLake refuses for one email and source (a 4xx) is listed in that engineer's `errors` and the rest is delivered.

The callback body (Sophia has not specified one):

```json
{
  "correlation_id": "0b8f3c52-...",
  "time_frame": "24h",
  "from": "2026-11-12T09:30:00Z",
  "to": "2026-11-13T09:30:00Z",
  "engineers": [
    {
      "email": "jane@arbisoft.com",
      "mapped_emails": ["jane.d@gmail.com"],
      "jira":     { "jane@arbisoft.com": { ... } },
      "github":   { "jane@arbisoft.com": { ... }, "jane.d@gmail.com": { ... } },
      "ai_usage": { "jane@arbisoft.com": { ... } },
      "ai_cost":  { "jane@arbisoft.com": { ... } },
      "errors": [
        { "source": "jira", "email": "jane.d@gmail.com", "status": 400, "error": "DevLake rejected the request (400)." }
      ]
    }
  ]
}
```

`from` and `to` are the window the stats cover. A time frame is counted back from when the client sent the request (`requested_on`), not from when the job gets to it, so a request that waited in the queue or was retried still covers the window the client meant, and every DevLake call for it asks for that same `from`/`to`. Months and years are calendar steps, worked out exactly as DevLake works out its own `tf` window (Go's `AddDate`: 31 March minus one month is 3 March). A range request has `from` and `to` and no `time_frame`. Each source holds the stats of every email as DevLake returned them. A batch has one entry per engineer.

`errors` lists every call DevLake refused for that engineer (a 4xx, or an answer that is not JSON, which has no `status`): that email is missing from that source, and everything else is still delivered, so one bad mapped email no longer costs the engineer's other stats or the rest of a batch. It is an empty array when everything was collected. The `error` text names the status only, never DevLake's answer.

On shutdown the job stops taking new work. A delivery to Sophia that has already started is finished and recorded, so a delivered result is never left unrecorded. A request stopped in the middle of collecting is handed back due at once, so the next start picks it up without waiting for its lease to run out.

| Setting | Default | Effect |
|---|---|---|
| `Processing:Enabled` | true | Turns the job on or off |
| `Processing:IntervalSeconds` | 30 | How often the job runs |
| `Processing:MaxParallelRequests` | 4 | Requests worked on at the same time |
| `Processing:RunBudgetSeconds` | 120 | How long one run keeps taking new work; work already started finishes |
| `Processing:DeliveryRetryDelaySeconds` | 30 | Wait before the second delivery attempt; doubles each time |
| `Processing:MaxDeliveryRetryDelaySeconds` | 900 | The longest wait between two delivery attempts. It must not be less than `DeliveryRetryDelaySeconds` |
| `Processing:UnavailableRetryDelaySeconds` | 60 | Wait before trying again a request held up by DevLake being down or its client's credentials being refused |
| `Processing:ClaimLeaseSeconds` | 600 | How long a worker holds a request. It must be longer than one step (collecting plus one delivery); a request whose worker stopped is picked up again after it |
| `Processing:StaleGraceSeconds` | 60 | Extra time past the queue lifetime before an unfinished request is failed |
| `Processing:RepublishAfterSeconds` | 60 | How old a request still `Received` must be before the job publishes it again. It must be more than twice `RabbitMq:PublishTimeoutSeconds`, or the host refuses to start, so an intake that is still publishing is never overtaken |

## Calls to DevLake, Sophia and Workstream

Three typed HTTP clients make the outbound calls. Each has its own timeout and circuit breaker, and none of them logs a URL, a token or a payload, only the correlation ID, the system and the status. The Sophia clients keep a breaker per host (scheme, host and port), because each client's outbound config names its own: one client's failing callback opens only its own breaker and never pauses or fails another client's deliveries.

| Client | Calls | Authentication |
|---|---|---|
| DevLake | `GET /is_valid`, `GET /stats/{email}/jira`, `/github`, `/ai_usage`, `/ai_cost` with `?tf=24h` or `?from=...&to=...`. `DevLake:BaseUrl` ends in `/rest/` | `Authorization: Bearer <DevLake:ApiToken>` |
| Workstream | `GET /is_valid`, `GET /projects?page=N&pageSize=M` | `Authorization: Bearer <Workstream:ApiToken>` |
| Sophia | `POST /oauth2/token/`, then the callback (`POST /api/v1/devlake/callback/`) | OAuth2 client credentials, or a stored API token |

Sophia's base URL, token URL, client ID, encrypted secret, scope and callback path and method come from the client's `ClientConfigs` and `ClientConfigOutboundUrls` rows, because each environment (Stage, Prod) has its own. The access token is reused until a minute before it expires, a rejected token is replaced once, and URLs must use HTTPS (plain HTTP only for loopback, for local stubs).

### DevLake endpoints

DevLake serves these for the Integration Service (`backend/server/api/integration`). They are reached through `/rest/...`. There, DevLake checks `Authorization: Bearer <API key>` and the key's allowed path, so create a DevLake API key whose allowed path is `^/(is_valid|stats/.+)$`. A direct call without the `/rest` prefix gets 401, even when login is off.

- **`GET is_valid`:** `true`. An invalid, expired or out-of-scope key gets 403 from DevLake, which the client reports as `false`.
- **Period:** give `tf` (1 to 999 and one of `h`, `d`, `w`, `M`, `y`, case-sensitive), both `from` and `to` (RFC 3339 with an explicit offset, `from` earlier than `to`, at most one year), or `since=joining`. `since=joining` runs from the email's first Jira, GitHub or AI activity in DevLake to now, with no length limit, and the response echoes `since` and the resolved `from`; an email with no activity gets an empty window and zeros. The last twelve months is `tf=1y`. Giving more than one form, one end of a range, or nothing gets 400 with a message naming the field.
- **Every stats response** starts with `email` (lowercased), `timeFrame` (left out for a range or `since`), `since` (only for `since=joining`), and `from` and `to` (RFC 3339 UTC, `[from, to)`). An email with no data gets zeros and empty lists.

| Category | Fields after the common ones |
|---|---|
| `jira` | `issuesResolved`, `storyPointsResolved`, `issuesCreated`, and the current `issuesInProgress` and `issuesTodo` |
| `github` | `commits`, `additions`, `deletions`, `pullRequestsOpened`, `pullRequestsMerged`, `pullRequestsWithCommits`, `reviews` |
| `ai_usage` | `providers: [{ provider, activeDays, sessions, suggestions, acceptances, linesAdded, linesRemoved, commitsByAi, pullRequests }]`, `toolEditsAccepted`, `toolEditsRejected` |
| `ai_cost` | `models: [{ provider, model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, estimatedCostUsd }]`, `totalEstimatedCostUsd` (decimal strings in USD) |

Data limits:

- **Breakdowns:** Jira adds `avgResolutionHours`, `byType` and `byTeam`. GitHub adds `avgPrMergeHours`, `pullRequestsReviewed`, `byRepo` and `byTeam`. Each `byRepo` and `byTeam` entry also gives the repo's totals for every contributor (anyone who authored a commit or pull request there, bots included) and the engineer's share of them: `commitSharePct`, `linesSharePct` and `pullRequestsMergedSharePct`, with `contributors` counting distinct commit author emails. AI usage adds `monthly` (per provider and UTC month) and `activeInLastMonth`. AI cost adds `monthly` (tokens and a decimal-string cost per UTC month). A team is a DevLake project, so an engineer on several projects appears in each. SkillForge usage is not available.
- **Jira and GitHub accounts:** Jira stats, and GitHub pull request authorship and reviews, match on the account's email, which many accounts hide. Commit counts and `pullRequestsWithCommits` use the commit author email, which is reliable.
- **AI data:** it is daily, so AI windows cover whole UTC days.

Every failure becomes one of four exceptions, so callers handle outcomes, not HTTP details:

| Exception | Meaning | What a caller should do |
|---|---|---|
| `ExternalAuthenticationException` | Credentials refused, or no usable token | Stop and leave work queued until the credentials are fixed |
| `ExternalApiUnavailableException` | Timeout, connection error, 5xx or 429 after the retries, or an open circuit | Try again later |
| `ExternalApiRejectedException` | The system refused this request (other 4xx) | Fail this request only |
| `ExternalApiResponseException` | A success answer that is not what the contract says | Fail this request only |

Only read calls retry (timeouts, 5xx and 429, never a 4xx). The Sophia callback is not retried by the HTTP layer: it returns the answer, successful or not, so the processing job can retry up to `maxAttempts` and record every attempt.

| Setting | Default | Effect |
|---|---|---|
| `DevLake:TimeoutSeconds`, `Sophia:TimeoutSeconds`, `Workstream:TimeoutSeconds` | 30 | How long one attempt waits |
| `DevLake:MaxConcurrentRequests` | 8 | Most requests in flight to DevLake at once, across the process |
| `Resilience:MaxRetries` | 3 | Retries of a failed read call |
| `Resilience:RetryBaseDelayMilliseconds` | 1000 | First retry delay; it doubles each time, with jitter |
| `Resilience:BreakerFailureRatio` | 0.5 | Share of failed calls that opens the circuit |
| `Resilience:BreakerMinimumThroughput` | 10 | Calls needed in the sampling window before it can open |
| `Resilience:BreakerSamplingSeconds` | 30 | The sampling window |
| `Resilience:BreakerBreakSeconds` | 30 | How long the circuit stays open before one probe call |

## Projects from Workstream

`GET /fetch/projects` (scope `projects:fetch`, not versioned) returns every Workstream project with its team lead, so DevLake never calls Workstream itself. It first checks Workstream's token, then reads `/projects?page=N&pageSize=M` page after page (`Workstream:PageSize`, default 10) until a page whose `next` link is null, an empty page, a page with nothing new on it, or a safety limit of 10,000 pages. A short page is not taken as the end, because Workstream may cap the page size below what was asked for.

```json
[ { "id": "p-1", "name": "Apollo", "team_lead": { "name": "Jane Doe", "email": "jane.doe@arbisoft.com" } } ]
```

- Only `id`, `name` and `team_lead` (`name` and `email`, either may be null) leave the service, whatever else Workstream sends. `team_lead` is null when Workstream has none.
- The list is complete or it is an error. A failure on any page returns an error and no projects, because a partial list would make DevLake think projects had been removed. A project listed on two pages is returned once.
- **Workstream's response shape is not documented**, so the mapper accepts the usual names: a bare array or an object holding the list under `results`, `data`, `items` or `projects`; `id`, `project_id`, `projectId` or `uuid`; `name`, `title`, `project_name` or `projectName`; and a team lead as an object under `team_lead`, `teamLead`, `lead`, `manager` or `project_manager` (or as flat `team_lead_name` and `team_lead_email` fields). A project with no id or no name fails the whole call. Once Workstream's real shape is known, `ProjectMapper` is the one place to change.

### Loading projects into DevLake

DevLake calls this from its **Project Ingestion** screen (admins only), through `POST /projects/load`. To set it up:

1. In the admin portal, create a client for DevLake with the `projects:fetch` scope, and issue it a secret.
2. Set `INTEGRATION_SERVICE_URL`, `INTEGRATION_SERVICE_CLIENT_ID` and `INTEGRATION_SERVICE_CLIENT_SECRET` in DevLake's `.env`. They stay on the server and never reach the browser. With any of the three empty, project ingestion is off. `INTEGRATION_SERVICE_TIMEOUT_SECONDS` (default 60) bounds one load.

DevLake gets a token from `POST /auth/token/`, calls `GET /fetch/projects`, and saves each project and its team lead in `workstream_projects`, keyed by Workstream ID, so loading again updates rows instead of duplicating them. `GET /workstream-projects` lists them and links each to the DevLake project of the same name. A load never creates DevLake projects.

Errors (all `ProblemDetails` with a `code` and the correlation ID, and never any Workstream data):

| Status | `code` | When |
|---|---|---|
| 502 | `workstream_token_invalid` | Workstream rejected this service's API token |
| 502 | `upstream_credentials` | Workstream rejected the token part way through |
| 502 | `upstream_rejected` | Workstream refused a page request |
| 502 | `upstream_bad_response` | The answer was not a list of readable projects |
| 503 (with `Retry-After`) | `upstream_unavailable` | Workstream could not be reached, or kept failing after the retries |

## Request status

`GET /api/v1/requests/poll/{uuid}` (scope `stats:read`) takes the `correlation_id` from a stats response and answers at once with `{ "correlation_id", "status", "check_time" }`. `check_time` is the time of the call in UTC, for example `2026-11-05T14:02:55Z`. The status is one of these, spelled exactly like this:

| Request log status | Poll status |
|---|---|
| Received, Queued | `Queued` |
| Processing, Processed | `Processing` |
| Success | `Success` |
| Failed | `Failure` |
| Revoked - no callback URL | `Revoked` |

A client can only read its own requests. An unknown ID and another client's ID both return the same 404, and a malformed ID returns 400. The poll API has its own rate limit (`RateLimits:PollPerMinute`).

These settings can be changed without code changes:

| Setting | Default | Effect |
|---|---|---|
| `Requests:DuplicateWindowMinutes` | 15 | How long an identical request counts as a duplicate. Read on every request, so editing `appsettings.json` applies without a restart |
| `Requests:AllowedEmailDomains` | `["arbisoft.com"]` | Domains whose emails are accepted |
| `RateLimits:StatsPerMinute` | 100 | Single-email requests per client per minute |
| `RateLimits:BatchPerMinute` | 20 | Batch requests per client per minute |
| `RateLimits:PollPerMinute` | 100 | Status poll requests per client per minute |
| `RateLimits:TokenPerMinute` | 10 | `POST /auth/token/` requests per caller IP address per minute. Each attempt runs a slow secret hash, so this stops secret guessing and CPU exhaustion. Over the limit the answer is 429 with `Retry-After` |

As with every setting, an environment variable overrides the file, for example `Requests__DuplicateWindowMinutes=5`.

## Build and test

```sh
dotnet build -warnaserror
dotnet format --verify-no-changes
dotnet test
```

Tests that need a database or broker are skipped unless these are set (the compose stack provides both):

```sh
export INTEGRATION_TEST_MYSQL="Server=127.0.0.1;Port=3308;User=root;Password=<root password>"
export INTEGRATION_TEST_RABBITMQ="host=127.0.0.1;port=5672;management=15672;user=<user>;password=<password>"
```

Each test creates its own throwaway database or queue and removes it afterwards.

Test data builders for `Client`, `AccessToken`, `RequestLog` and `ClientConfig` are in `UnitTests/TestHelpers/Builders`. Each starts from a valid default, so a test names only the fields it cares about. Upstream systems are faked with `FakeHttpMessageHandler` and `UpstreamStub`, and the API and admin portal are hosted in-process with `ApiFactory` and `PortalFactory`.

CI runs the same steps plus a vulnerable-package check (`.github/workflows/integration-service.yml`).
