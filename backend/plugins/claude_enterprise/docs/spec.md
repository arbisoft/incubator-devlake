# `claude_enterprise` Plugin — Design Spec

**Date:** 2026-06-30  
**Status:** Historical discovery draft — superseded for implementation  
**Relates to:** existing `claude` plugin (Path A — Claude Code Analytics / platform.anthropic.com)

> **Implementation authority:** Use [`implementation-plan.md`](./implementation-plan.md).
> Its authentication contract, endpoint matrix, collection rules, architecture,
> and phased gates have been verified against the current public API
> documentation. The provisional endpoints and open questions below are kept
> only as design history and must not be implemented.

---

## 1. Problem

The existing `claude` plugin pulls from the **Claude Code Analytics API** (`organizations/usage_report/claude_code`) using an Admin API key from platform.anthropic.com. This only covers teams that consume Anthropic's API directly (pay-as-you-go).

Our organisation runs **claude.ai Team/Enterprise subscriptions**. These are a completely separate product and identity system. Users authenticate to claude.ai, not to the Anthropic API console. The usage data for those seats lives behind a different set of endpoints (the **Claude Enterprise Analytics API**), protected by an Analytics API key issued from the claude.ai admin panel.

The `claude` plugin is therefore a no-op for us. This spec covers a new plugin — `claude_enterprise` — that targets the claude.ai analytics surface.

---

## 2. Scope

In scope:
- New DevLake plugin `claude_enterprise` modelled on the existing `claude` plugin structure
- Connection model: Analytics API key + Organization ID from claude.ai
- Collector task: pull usage/analytics data from the claude.ai Analytics API
- Extractor + converter tasks: map API responses to DevLake domain models
- Migration scripts for tool-layer tables
- Grafana dashboard (or reuse/extend existing `ClaudeEnterpriseAdoption.json`)

Out of scope (initial version):
- Merging with the `claude_enterprise` plugin — they serve different products, keep them separate
- Seat management or user provisioning
- Real-time webhooks

---

## 3. Open Questions — Needs Verification Before Build

These must be answered against Anthropic's actual docs or by testing with a live key before any code is written.

| # | Question | Why it matters |
|---|----------|----------------|
| Q1 | Is the Analytics API available on **Team** tier or **Enterprise only**? | Determines whether this plugin is usable for us at all |
| Q2 | Where exactly is the Analytics API key generated? (claude.ai → Settings → ?) | Connection setup instructions in UI |
| Q3 | What is the key prefix? (user said `sk-ant-api01-...` but needs confirmation) | Validation in `validateConnection` |
| Q4 | **Exact endpoint paths** under `organizations/analytics/` — see §5 below | The entire collector depends on this |
| Q5 | What granularity is data available at? (per-user/per-day? per-model? aggregate only?) | Determines data model shape |
| Q6 | What metrics does the API return? Tokens? Messages? Active users? Cost? | Data model fields |
| Q7 | Pagination mechanism — cursor-based (like Path A) or page-number? | Collector pagination logic |
| Q8 | Is `organization_id` in the path, a query param, or implicit from the key? | URL template and connection model |
| Q9 | Date-range query params — `starting_at`? `start_date`/`end_date`? | Incremental sync query builder |
| Q10 | Rate limits (requests/hour or requests/min)? | `DefaultRateLimitPerHour` constant |
| Q11 | Does the API support incremental sync or only full snapshot? | Whether `StatefulApiCollector` is the right pattern |

---

## 4. Authentication

**Key type:** Analytics API key  
**Key format (to confirm — Q3):** `sk-ant-api01-...`  
**Scope required:** `read:analytics`  
**Header:** `x-api-key: <key>`  
**Required header:** `anthropic-version: 2023-06-01` (same as Path A)

**Where to get a key (to confirm — Q2):**  
claude.ai → Admin Settings → API Keys → Create Analytics API Key

The key is **not interchangeable** with:
- Admin API keys from platform.anthropic.com (`sk-ant-admin01-...`) — those are Path A
- User API keys (`sk-ant-api03-...`) — those are for direct API usage billing

---

## 5. API Endpoints

These are our best current understanding of the endpoint surface. **All paths and response shapes must be verified against Anthropic's Enterprise analytics docs before implementation.**

### 5.1 Base URL
```
https://api.anthropic.com/v1
```

### 5.2 Usage / Activity endpoint (primary collector target)

**Assumed path (to verify — Q4):**
```
GET /v1/organizations/analytics/messages
```
or possibly:
```
GET /v1/organizations/{organization_id}/analytics/usage
```

**Assumed query parameters (to verify — Q9):**
```
start_date=2026-01-01
end_date=2026-06-30
page=<cursor>      # or: page_number=1, page_size=100
```

**Assumed response envelope (to verify — Q7):**
```json
{
  "data": [ ... ],
  "has_more": true,
  "next_cursor": "abc123"
}
```

**Assumed per-record shape (to verify — Q5, Q6):**
```json
{
  "date": "2026-06-01",
  "user_email": "dev@example.com",
  "model": "claude_enterprise-opus-4-8",
  "message_count": 42,
  "input_tokens": 18000,
  "output_tokens": 4200,
  "conversation_count": 12
}
```

> **Note:** The Path A (`claude` plugin) response includes rich Claude Code-specific fields: `lines_of_code`, `commits_by_claude_code`, `tool_actions`, etc. The Path B analytics API likely returns conversation/message-level metrics instead. Do not assume the same schema.

### 5.3 Users endpoint (optional — for scope listing)

**Assumed path:**
```
GET /v1/organizations/{organization_id}/members
```
or
```
GET /v1/organizations/members
```

This would allow the `remote-scopes` endpoint to enumerate team members for filtering. **Verify whether this exists and is covered by the `read:analytics` scope.**

### 5.4 Test-connection probe

The `TestConnection` service should hit the analytics endpoint with a narrow date window (e.g. last 7 days) and expect HTTP 200. Mirror the pattern in `claude_enterprise/service/connection_test_helper.go:42–85`.

---

## 6. Data Model

### 6.1 Tool-layer table: `_tool_claude_enterprise_usage`

Fields below are provisional. Actual column set depends on API response (Q5, Q6).

```go
type ClaudeEnterpriseUsage struct {
    common.NoPKModel

    // Primary key
    ConnectionId      uint64    // DevLake connection
    ScopeId           string    // organization_id
    Date              time.Time // day granularity
    UserEmail         string    // member email
    Model             string    // claude_enterprise-opus-4-8, claude_enterprise-sonnet-4-6, etc.

    // Conversation metrics (what claude.ai tracks)
    ConversationCount int
    MessageCount      int       // user messages sent

    // Token metrics (if exposed by API)
    InputTokens  int64
    OutputTokens int64

    // Cost (if exposed by API — Enterprise plans may be seat-priced, not token-priced)
    EstimatedCostUsd float64
}
```

> **Cost field caveat:** claude.ai Team/Enterprise is typically seat-billed, not token-billed. The `EstimatedCostUsd` field may not be meaningful or may not be returned by the API. Flag as nullable.

### 6.2 Domain-layer mapping

Map into the existing `ai_activity` domain table introduced in migration `20260331_add_ai_activities_unified_schema.go`. That table is already the target for the Path A `claude` plugin's converter, so both plugins converge at the same domain layer — enabling cross-product Grafana dashboards.

Verify field names in:  
[`backend/core/models/domainlayer/ai/ai_activity.go`](../../core/models/domainlayer/ai/ai_activity.go)

### 6.3 Connection table: `_tool_claude_enterprise_connections`

```go
type ClaudeEnterpriseConn struct {
    helper.RestConnection  // embeds Endpoint, Proxy, RateLimitPerHour
    AnalyticsApiKey string  // json:"token"; encrypted at rest
    OrganizationId  string  // from claude.ai org settings (optional if key is org-scoped)
}
```

Note: field is named `AnalyticsApiKey` (not `AdminApiKey`) to make the distinction explicit and avoid confusion when both plugins are configured side-by-side.

---

## 7. Plugin Structure

Mirror the `claude_enterprise` plugin layout exactly:

```
backend/plugins/claude_enterprise/
├── claude_enterprise.go          # plugin entrypoint (PluginEntry var)
├── docs/
│   └── spec.md                   # this file
├── api/
│   ├── init.go                   # wires connectionHelper, raScopeList, validator
│   ├── connection.go             # CRUD + validateConnection
│   ├── test_connection.go        # POST /test, POST /connections/:id/test
│   ├── scope.go                  # GetScope, PutScopes, PatchScope, DeleteScope, GetScopeList
│   ├── scope_config.go           # CRUD for ScopeConfig
│   ├── blueprint_v200.go         # MakeDataSourcePipelinePlanV200
│   └── remote_api.go             # RemoteScopes, SearchRemoteScopes
├── impl/
│   ├── impl.go                   # ClaudeEnterprise struct implementing all plugin interfaces
│   └── options.go                # NormalizeConnection helper
├── models/
│   ├── connection.go             # ClaudeEnterpriseConn, ClaudeEnterpriseConnection
│   ├── scope.go                  # ClaudeEnterpriseScope
│   ├── scope_config.go           # ClaudeEnterpriseScopeConfig
│   ├── claude_enterprise_usage.go # ClaudeEnterpriseUsage (tool-layer)
│   ├── models.go                 # GetTablesInfo()
│   └── migrationscripts/
│       ├── register.go
│       └── 20260630_initialize.go
├── service/
│   └── connection_test_helper.go # TestConnection()
└── tasks/
    ├── task_data.go              # ClaudeEnterpriseTaskData, ClaudeEnterpriseOptions
    ├── options.go                # ClaudeEnterpriseRawParams
    ├── register.go               # GetSubTaskMetas()
    ├── api_client.go             # CreateApiClient()
    ├── usage_collector.go        # CollectUsage — hits /organizations/analytics/...
    ├── usage_extractor.go        # ExtractUsage — raw JSON → ClaudeEnterpriseUsage
    └── usage_converter.go        # ConvertUsage — ClaudeEnterpriseUsage → ai_activity
```

---

## 8. Key Implementation Decisions

### 8.1 Separate plugin vs. extending `claude_enterprise`

Keep as a **separate plugin**. Reasons:
- Different auth model (different key type, different issuer)
- Different API surface (different endpoints, different response shapes)
- Different metrics (conversation-level vs. code-level)
- Side-by-side configuration: an org could theoretically have both API usage (Path A) and claude.ai seats (Path B)
- Clean separation means neither plugin breaks when the other's upstream API changes

### 8.2 Collector pattern

Use `helper.NewStatefulApiCollector` (same as `claude_enterprise` plugin) for incremental sync support. The `GetSince()` call gives us the last successful sync timestamp to pass as `start_date`.

If the API only supports full snapshots (Q11), fall back to `helper.NewApiCollector` with a fixed 90-day window like the `claude_enterprise` plugin's default.

### 8.3 Scope model

The "scope" for this plugin is an **organization** (the claude.ai org). If `OrganizationId` is implicit in the key (i.e. the key is already org-scoped and you can't query cross-org), then:
- `RemoteScopes` returns a single synthetic scope entry built from `connection.OrganizationId`
- The scope ID = org ID

This is identical to how the `claude_enterprise` plugin's `remote_api.go` currently works.

### 8.4 `validateConnection`

Initially: require `AnalyticsApiKey` non-empty. Optionally add prefix check once Q3 is confirmed:
```go
if !strings.HasPrefix(key, "sk-ant-api01-") {
    return errors.BadInput.New("key must be an Analytics API key (sk-ant-api01-...)")
}
```
The `claude_enterprise` plugin deliberately skips prefix validation — add it here for clarity since the two key types are easy to confuse.

---

## 9. Grafana Dashboard

Two options:
1. **Extend `ClaudeEnterpriseAdoption.json`** — add a "Source" variable (`claude` vs `claude_enterprise`) and fan queries across both `_tool_claude_usage` and `_tool_claude_enterprise_usage`. Best for a unified view.
2. **New dashboard `ClaudeEnterpriseAdoption.json`** — simpler to build initially, can be merged later.

Recommendation: start with option 2 (new dashboard), merge into option 1 once the data model is confirmed.

---

## 10. Migration Script

Filename convention from existing scripts:  
`YYYYMMDDNNNNNN_description.go` where `NNNNNN` is a 6-digit sequence.

Proposed: `20260630000001_add_claude_enterprise_initial_tables.go`

Tables to create:
- `_tool_claude_enterprise_connections`
- `_tool_claude_enterprise_scopes`
- `_tool_claude_enterprise_scope_configs`
- `_tool_claude_enterprise_usage`

---

## 11. Pre-Build Checklist

Before any code:

- [ ] Verify Analytics API availability on Team tier (Q1)
- [ ] Obtain an Analytics API key from claude.ai admin panel and confirm key prefix (Q2, Q3)
- [ ] Hit the API manually with `curl` and document the exact endpoint paths and response shapes (Q4–Q9)
- [ ] Confirm pagination mechanism (Q7)
- [ ] Confirm rate limits (Q10)
- [ ] Review `backend/core/models/domainlayer/ai/ai_activity.go` to confirm converter target fields
- [ ] Decide: extend `ClaudeEnterpriseAdoption.json` or new dashboard (§9)

---

## 12. Reference

| Item | Location |
|------|----------|
| Path A plugin (reference implementation) | `backend/plugins/claude_enterprise/` |
| Domain model (converter target) | `backend/core/models/domainlayer/ai/ai_activity.go` |
| Domain migration | `backend/core/models/migrationscripts/20260331_add_ai_activities_unified_schema.go` |
| Existing Grafana dashboards | `grafana/dashboards/ClaudeEnterpriseAdoption.json`, `grafana/dashboards/AICostBilling.json` |
| Anthropic Analytics API docs | https://docs.anthropic.com/en/docs/claude_enterprise-code/analytics (verify URL for claude.ai analytics) |
| DevLake plugin helper | `helpers/pluginhelper/api/` |
