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
# Claude Enterprise

Collects organization adoption, per-user activity, Claude Code productivity,
token usage, and cost data from the **Claude Enterprise Analytics API**
(`claude.ai` Enterprise organizations).

## Enterprise-only availability

This plugin only supports **Claude Enterprise** organizations. It is
separate from, and not a replacement for, the [`claude`](../claude/) plugin,
which uses the Claude Platform/Console Admin API key.

| Product | Credential | API surface | DevLake plugin |
|---|---|---|---|
| Claude Platform / Console | Admin API key | `/v1/organizations/usage_report/claude_code` | [`claude`](../claude/) |
| Claude Enterprise (`claude.ai`) | Analytics API key | `/v1/organizations/analytics/*` | `claude_enterprise` (this plugin) |

Claude Team subscriptions are **not supported**: Anthropic does not
currently document programmatic Analytics API access for Team, and this
plugin must not be pointed at private `claude.ai` endpoints, browser
cookies, or user session tokens to work around that. See
[`docs/implementation-plan.md`](./docs/implementation-plan.md) Section 2 for
the full availability discussion.

## Setting up a connection

1. In `claude.ai`, go to **Organization settings → API** and create an
   **Analytics API key** as a **Primary Owner**, granting it the
   `read:analytics` scope. This is a different credential from the Console
   Admin API key used by the `claude` plugin — the two are not
   interchangeable.
2. In DevLake's config UI, add a **Claude Enterprise** connection (listed
   separately from **Claude**) and supply:
   - The Analytics API key (stored encrypted, never returned by the API).
   - The Enterprise **Organization ID**. DevLake requires this to create the
     organization scope; it will not invent a remote scope when this field
     is empty.
   - Optionally a proxy and a custom hourly rate limit (defaults to 2,400
     requests/hour per connection, conservative against Anthropic's
     documented 60 requests/minute, organization-wide default).
3. Test the connection, then create a blueprint against the resulting
   organization scope.

See the [Analytics APIs](https://platform.claude.com/docs/en/manage-claude/analytics-api)
and [Claude Enterprise Analytics API reference](https://platform.claude.com/docs/en/api/admin/analytics)
documentation for further detail.

## What is collected

MVP endpoints (`/v1/organizations/analytics/...`): `summaries`, `users`,
`user_usage_report`, `user_cost_report`.

Extended endpoints: `usage_report`, `cost_report`, `skills`, `connectors`,
`apps/chat/projects`, `plugins`, `artifacts`.

Every entity is collected into a raw table, extracted into a tool-layer
table, and converted into the shared `ai_activities` domain table only where
DevLake has a semantically compatible mapping (currently Claude Code and
Claude chat activity). See
[`docs/implementation-plan.md`](./docs/implementation-plan.md) Sections 4, 7,
and 9 for the full endpoint matrix, data flow, and domain-mapping contract.

## Dashboards

- `grafana/dashboards/ClaudeEnterpriseAdoption.json` — Enterprise-only
  adoption, activity, token, and cost panels.
- `grafana/dashboards/ClaudeUnifiedReporting.json` — unified Claude
  Platform + Claude Enterprise reporting with a `source` filter, merging
  only metrics that are semantically equivalent between the two plugins.

## Status

Implemented and verified from official Anthropic documentation and
synthetic fixtures only (no live Analytics API key used or required to
build, test, or dashboard this plugin). Live-key smoke validation is a
separate, deferred phase — see
[`docs/implementation-plan.md`](./docs/implementation-plan.md) for the full
phase-by-phase implementation history and current status.
