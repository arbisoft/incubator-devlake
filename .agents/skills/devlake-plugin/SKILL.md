---
name: devlake-plugin
description: Complete guide for implementing a new datasource plugin in Apache DevLake. Covers architecture, all required interfaces, three-layer data model, subtask patterns, migration scripts, API registration, config-ui frontend wiring, blueprint planning, CI/lint/testing requirements, and known pitfalls verified against real plugin code. Use whenever a new DevLake plugin is being added.
origin: custom
---

# DevLake Plugin Development Guide

## When to Activate

- Implementing a new datasource plugin
- Extending an existing plugin with new entity types
- Debugging a plugin's data pipeline
- Reviewing a plugin PR before it's proposed upstream

See also `AGENTS.md` at the repo root for a condensed version of this guide aimed at general coding agents. This skill is the deep-dive; keep the two in sync if either changes.

---

## Plugin Categories — the "canonical structure" below is NOT universal

Not every plugin in `backend/plugins/` looks the same. Before following the canonical layout, confirm which category you're building — copying the wrong template produces plugins with dead code or missing interfaces:

| Category | Example | `models/` | `tasks/` | Interfaces beyond `PluginMeta`/`PluginModel`/`PluginMigration` |
|---|---|---|---|---|
| **REST datasource plugin** (the common case) | `github`, `gitlab`, `jira`, `taiga` | connection + scope + scope-config + tool-layer entities | collector → extractor → converter per entity | `PluginInit`, `PluginTask`, `CloseablePluginTask`, `PluginSource`, `PluginApi`, `DataSourcePluginBlueprintV200` |
| **Push/webhook plugin** | `webhook` | connection + scope only, no tool-layer entities | no collector/extractor — API handlers write domain tables directly | `PluginInit`, `PluginApi`, `DataSourcePluginBlueprintV200` (no `PluginSource`, no `CloseablePluginTask`) |
| **Post-processing / calculator plugin** | `dbt`, `refdiff` | minimal or none — operates on already-collected data | "calculator" tasks, not collector/extractor/converter | `PluginTask`, `PluginApi`; `refdiff` also implements `PluginMetric` |
| **Cross-plugin metric plugin** | `refdiff` (dora-style) | none | metric calculators reading multiple plugins' domain tables | `PluginMetric` — `RequiredDataEntities()`, project-dependency methods |

**If you're building a normal "collect issues/PRs/pipelines from a SaaS API" plugin, you are in the REST datasource category — everything below applies to you.** If you're building something push-based or purely computational, use `webhook`/`dbt`/`refdiff` as your reference instead of this guide's step-by-step.

There is no scaffolding/generator tool in this repo (checked `backend/Makefile` and scripts) — you hand-write the plugin or copy an existing one as a starting skeleton.

---

## Repository Layout (backend)

```
backend/
├── core/
│   ├── plugin/                    # All plugin interfaces (PluginMeta, SubTaskMeta, etc.)
│   ├── models/domainlayer/        # Standardised domain models
│   │   ├── code/                  # Repo, Commit, PullRequest, Ref
│   │   ├── ticket/                # Board, Issue, BoardIssue, Sprint
│   │   ├── devops/                # CicdPipeline, CicdTask, CicdDeployment
│   │   └── didgen/                # Deterministic domain ID generator
│   └── dal/                       # Database abstraction layer
├── helpers/pluginhelper/api/      # Reusable helpers: ApiCollector, StatefulApiCollector, ApiExtractor, DataConverter
├── plugins/
│   ├── table_info_test.go         # CI check: every model must be listed in GetTablesInfo()
│   └── {plugin-name}/             # One directory per plugin (see structure below)
├── scripts/build-plugins.sh       # Auto-discovers every dir under backend/plugins/ and builds it as a .so — no manual registry to edit
└── server/                        # HTTP server; plugins loaded dynamically at runtime via core/runner/loader.go (plug.Lookup("PluginEntry"))
```

Plugins are **not** listed in a central Go file. `build-plugins.sh` globs every directory under `backend/plugins/` (excluding `core`/`helper`/`logs`) and the runtime loader (`backend/core/runner/loader.go`) discovers the resulting `.so` files automatically. You don't need to register a new plugin anywhere in the backend beyond writing its directory — but see **Frontend Wiring** below, because the config-ui side is *not* automatic.

**Rule: plugins must be independent — no cross-plugin Go imports.** Share code via `core/` or `helpers/`, never by importing another plugin's package.

---

## Canonical Plugin Directory Structure (REST datasource plugins)

```
backend/plugins/{plugin}/
├── {plugin}.go                          # Entrypoint: calls plugin.Register at init()
├── impl/
│   └── impl.go                          # Main struct, implements ALL required plugin interfaces
├── models/
│   ├── connection.go                    # Connection + auth model
│   ├── {scope}.go                       # Scope model (e.g. project, repo, board)
│   ├── scope_config.go                  # ScopeConfig model
│   ├── {entity}.go                      # Tool-layer entity models (one file per entity)
│   └── migrationscripts/
│       ├── register.go                  # All() returns []MigrationScript
│       └── {timestamp}_{description}.go # Individual migration
├── tasks/
│   ├── register.go                      # (recommended for plugins with many subtasks) SubTaskMetaList + RegisterSubtaskMeta()
│   ├── task_data.go                     # Options + TaskData structs; DecodeAndValidate
│   ├── api_client.go                    # NewXxxApiClient factory + rate limiter
│   ├── {entity}_collector.go           # RAW collection: API → _raw_*, calls RegisterSubtaskMeta in init()
│   ├── {entity}_extractor.go           # Extraction: _raw_* → _tool_*
│   └── {entity}_convertor.go          # Conversion: _tool_* → domain tables
└── api/
    ├── init.go                          # DsHelper, proxy, scope list init
    ├── connection_api.go                # Connection CRUD handlers
    ├── scope_api.go                     # Scope CRUD handlers
    ├── scope_config_api.go              # ScopeConfig CRUD handlers
    ├── remote_api.go                    # Remote scope discovery
    └── blueprint_v200.go               # Pipeline plan generation
```

> **Reference plugins**: `backend/plugins/gitlab/` and `backend/plugins/github/` are the mature, battle-tested references — use them for pagination, incremental sync, and rate-limiting patterns. `backend/plugins/taiga/` is a smaller, easier-to-read example of the same directory shape, but it has known, *currently unfixed* bugs (see Known Pitfalls below) — don't copy its collector or converter logic verbatim.

**Two valid ways to register subtasks in `SubTaskMetas()`:**
1. **Manual list** (taiga's approach) — `impl.go` returns a hand-written `[]plugin.SubTaskMeta{...}`. Simple, but easy to forget an entry as the plugin grows.
2. **`tasks/register.go` + `init()`** (gitlab's approach, recommended for plugins with more than ~5 subtasks) — each `*_collector.go`/`*_extractor.go`/`*_convertor.go` calls `RegisterSubtaskMeta(&XyzMeta)` in its own `init()`; `impl.go`'s `SubTaskMetas()` just returns `tasks.SubTaskMetaList`. New subtasks can't be forgotten because they self-register.

---

## Interface Checklist — impl/impl.go

A REST datasource plugin implements all of these. Use a compile-time assertion:

```go
var _ interface {
    plugin.PluginMeta
    plugin.PluginInit
    plugin.PluginTask
    plugin.PluginApi
    plugin.PluginModel
    plugin.PluginMigration
    plugin.DataSourcePluginBlueprintV200
    plugin.CloseablePluginTask
    plugin.PluginSource
} = (*MyPlugin)(nil)
```

**This full list applies to scoped, connection-based datasource plugins only.** Push/webhook plugins skip `PluginSource` and `CloseablePluginTask`; calculator plugins (`dbt`) may implement just `PluginMeta` + `PluginTask` + `PluginModel`; cross-plugin metric plugins add `PluginMetric` instead of the datasource interfaces. Verified by inspecting `webhook/impl/impl.go`, `dbt/impl/impl.go`, and `refdiff/impl/impl.go`.

### Interface Definitions

| Interface | Methods Required |
|---|---|
| `PluginMeta` | `Name() string`, `Description() string`, `RootPkgPath() string` |
| `PluginInit` | `Init(basicRes context.BasicRes) errors.Error` |
| `PluginTask` | `SubTaskMetas() []SubTaskMeta`, `PrepareTaskData(...)` |
| `CloseablePluginTask` | `Close(taskCtx plugin.TaskContext) errors.Error` |
| `PluginModel` | `GetTablesInfo() []dal.Tabler` — **must list every model or `plugins/table_info_test.go` fails CI** |
| `PluginMigration` | `MigrationScripts() []MigrationScript` |
| `PluginSource` | `Connection() dal.Tabler`, `Scope() ToolLayerScope`, `ScopeConfig() dal.Tabler` |
| `PluginApi` | `ApiResources() map[string]map[string]ApiResourceHandler` |
| `DataSourcePluginBlueprintV200` | `MakeDataSourcePipelinePlanV200(...)` |
| `PluginMetric` (cross-plugin metric plugins only, e.g. `refdiff`) | `RequiredDataEntities() ([]map[string]interface{}, errors.Error)`, plus a project-dependency method |

### RootPkgPath

Must exactly match the Go module import path:

```go
func (p MyPlugin) RootPkgPath() string {
    return "github.com/apache/incubator-devlake/plugins/myplugin"
}
```

---

## Three-Layer Data Model

Every entity flows through three layers. **Never skip a layer.**

```
Remote API → _raw_{plugin}_api_{entity} → _tool_{plugin}_{entity} → domain table
              (Collector)                   (Extractor)               (Converter)
```

| Layer | Table prefix | Populated by | Contains |
|---|---|---|---|
| Raw | `_raw_` | Collector | Verbatim JSON blobs from the API |
| Tool | `_tool_` | Extractor | Typed Go structs (plugin-specific) |
| Domain | (no prefix) | Converter | Standardised cross-plugin models |

---

## Domain Types

Set `DomainTypes` on every `SubTaskMeta`:

```go
plugin.DOMAIN_TYPE_CODE        // repositories, commits, branches
plugin.DOMAIN_TYPE_TICKET      // issues, boards, sprints
plugin.DOMAIN_TYPE_CODE_REVIEW // pull/merge requests
plugin.DOMAIN_TYPE_CROSS       // issue-PR links
plugin.DOMAIN_TYPE_CICD        // pipelines, deployments
plugin.DOMAIN_TYPE_CODE_QUALITY
```

---

## Step-by-Step: Build a New Plugin

### Step 1 — Connection Model

```go
// models/connection.go
type MyConn struct {
    helper.RestConnection `mapstructure:",squash"` // Endpoint, Proxy, RateLimitPerHour
    // Choose ONE auth approach:
    ApiKey string `mapstructure:"apiKey" json:"apiKey" gorm:"serializer:encdec"`
    // OR:
    helper.BasicAuth `mapstructure:",squash"` // Username + Password
    // OR:
    helper.MultiAuth `mapstructure:",squash"` // Multiple auth methods
}

func (c *MyConn) SetupAuthentication(req *http.Request) errors.Error {
    req.Header.Set("X-Api-Key", c.ApiKey)
    return nil
}

func (c *MyConn) Sanitize() MyConn {
    c.ApiKey = utils.SanitizeString(c.ApiKey)
    return *c
}

type MyConnection struct {
    helper.BaseConnection `mapstructure:",squash"` // ID, Name, CreatedAt, UpdatedAt
    MyConn                `mapstructure:",squash"`
}

func (MyConnection) TableName() string { return "_tool_myplugin_connections" }

// Preserve existing secrets on PATCH — do NOT trust empty string from client
func (connection *MyConnection) MergeFromRequest(target *MyConnection, body map[string]interface{}) error {
    existing := target.ApiKey
    if err := helper.DecodeMapStruct(body, target, true); err != nil {
        return err
    }
    if target.ApiKey == "" || target.ApiKey == utils.SanitizeString(existing) {
        target.ApiKey = existing
    }
    return nil
}

func (connection MyConnection) Sanitize() MyConnection {
    connection.MyConn = connection.MyConn.Sanitize()
    return connection
}
```

### Step 2 — Scope Model

```go
// models/my_project.go
type MyProject struct {
    common.Scope     `mapstructure:",squash"`  // ConnectionId, ScopeConfigId
    ProjectId        string    `json:"projectId" gorm:"primaryKey"`
    Name             string    `json:"name"`
    Description      string    `json:"description"`
    Url              string    `json:"url"`
}

func (MyProject) TableName() string { return "_tool_myplugin_projects" }

func (p *MyProject) ScopeId() string           { return p.ProjectId }
func (p *MyProject) ScopeName() string         { return p.Name }
func (p *MyProject) ScopeFullName() string     { return p.Name }
func (p *MyProject) ScopeParams() interface{}  {
    return &MyApiParams{ConnectionId: p.ConnectionId, ProjectId: p.ProjectId}
}
func (p *MyProject) ScopeConnectionId() uint64     { return p.ConnectionId }
func (p *MyProject) ScopeScopeConfigId() uint64    { return p.ScopeConfigId }
```

### Step 3 — ScopeConfig Model

```go
// models/scope_config.go
type MyScopeConfig struct {
    common.ScopeConfig `mapstructure:",squash"` // ID, ConnectionId, Name, Entities
    // Plugin-specific enrichment:
    TypeMappings   map[string]TypeMapping `json:"typeMappings" gorm:"serializer:json"`
    // Deployment/production patterns (for CICD domain):
    DeploymentPattern  string `json:"deploymentPattern"`
    ProductionPattern  string `json:"productionPattern"`
}

func (MyScopeConfig) TableName() string { return "_tool_myplugin_scope_configs" }
```

### Step 4 — Tool-layer Entity Model

> **Primary key consistency matters.** Whatever fields you tag `gorm:"primaryKey"` here is *exactly* the argument list (in struct-declaration order) you must pass to `didgen.Generate(...)` in the converter (Step 9). A mismatch panics at runtime with "primary key values do not match". Decide up front whether `ProjectId` is part of the domain ID (multi-project cross-referencing) or just a filter column (`gorm:"index"`) — see Taiga's real model (`taiga/models/issue.go`) for the "index only" choice, which keeps issue IDs stable even if a project is re-scoped.

```go
// models/my_issue.go
type MyIssue struct {
    common.NoPKModel                          // CreatedAt, UpdatedAt, RawDataOrigin
    ConnectionId   uint64    `gorm:"primaryKey"`
    IssueId        string    `gorm:"primaryKey"`
    ProjectId      string    `gorm:"index"`     // filter column, NOT part of the domain ID
    Title          string
    Description    string
    Status         string
    IssueType      string
    Priority       string
    AssigneeId     string
    AssigneeName   string
    CreatedDate    *time.Time
    UpdatedDate    *time.Time
    ClosedDate     *time.Time
}

func (MyIssue) TableName() string { return "_tool_myplugin_issues" }
```

### Step 5 — Task Data & Options

```go
// tasks/task_data.go
type MyApiParams struct {
    ConnectionId uint64 `json:"connectionId"`
    ProjectId    string `json:"projectId"`
}

type MyOptions struct {
    ConnectionId  uint64           `json:"connectionId"  mapstructure:"connectionId"`
    ProjectId     string           `json:"projectId"     mapstructure:"projectId"`
    ScopeConfig   *models.MyScopeConfig `json:"scopeConfig" mapstructure:"scopeConfig"`
    ScopeConfigId uint64           `json:"scopeConfigId" mapstructure:"scopeConfigId"`
    PageSize      int              `json:"pageSize"      mapstructure:"pageSize"`
}

type MyTaskData struct {
    Options   *MyOptions
    ApiClient *api.ApiAsyncClient
}
```

### Step 6 — API Client Factory (with real rate limiting)

Every mature plugin builds an `ApiRateLimitCalculator` — passing `nil` means unlimited concurrency, which will get your plugin rate-limited or IP-banned by the remote API on large syncs. Prefer a `DynamicRateLimit` callback that reads the API's own rate-limit headers when available (pattern from `gitlab/tasks/api_client.go`):

```go
// tasks/api_client.go
func CreateMyAsyncApiClient(
    taskCtx plugin.TaskContext,
    apiClient *api.ApiClient,
    connection *models.MyConnection,
) (*api.ApiAsyncClient, errors.Error) {
    rateLimiter := &api.ApiRateLimitCalculator{
        UserRateLimitPerHour: connection.RateLimitPerHour,
        DynamicRateLimit: func(res *http.Response) (int, time.Duration, errors.Error) {
            remaining := res.Header.Get("X-RateLimit-Remaining")
            if remaining == "" {
                return 0, 0, nil // fall back to UserRateLimitPerHour / plugin default
            }
            limit, err := strconv.Atoi(res.Header.Get("X-RateLimit-Limit"))
            if err != nil {
                return 0, 0, errors.Default.Wrap(err, "failed to parse rate limit header")
            }
            return limit, 1 * time.Hour, nil
        },
    }
    return api.CreateAsyncApiClient(taskCtx, apiClient, rateLimiter)
}

func NewMyApiClient(taskCtx plugin.TaskContext, connection *models.MyConnection) (*api.ApiAsyncClient, errors.Error) {
    apiClient, err := api.NewApiClientFromConnection(taskCtx.GetContext(), taskCtx, connection)
    if err != nil {
        return nil, err
    }
    return CreateMyAsyncApiClient(taskCtx, apiClient, connection)
}
```

### Step 7 — Collector (API → Raw, with real pagination and incremental sync)

Use `helper.NewStatefulApiCollector` (not the plain `NewApiCollector`) so the collector supports incremental "since" syncs out of the box — the pattern used by `gitlab`/`github`, not by Taiga (Taiga's collector does a full re-collect every run):

```go
// tasks/issue_collector.go
func init() {
    RegisterSubtaskMeta(&CollectIssuesMeta)
}

const RAW_ISSUE_TABLE = "myplugin_api_issues"

var CollectIssuesMeta = plugin.SubTaskMeta{
    Name:             "collectIssues",
    EntryPoint:       CollectIssues,
    EnabledByDefault: true,
    Description:      "collect MyPlugin issues from remote API, supports incremental sync",
    DomainTypes:      []string{plugin.DOMAIN_TYPE_TICKET},
}

func CollectIssues(taskCtx plugin.SubTaskContext) errors.Error {
    data := taskCtx.GetData().(*MyTaskData)
    rawDataSubTaskArgs := &api.RawDataSubTaskArgs{
        Ctx: taskCtx,
        Params: MyApiParams{
            ConnectionId: data.Options.ConnectionId,
            ProjectId:    data.Options.ProjectId,
        },
        Table: RAW_ISSUE_TABLE,
    }

    collector, err := api.NewStatefulApiCollector(*rawDataSubTaskArgs)
    if err != nil {
        return err
    }

    err = collector.InitCollector(api.ApiCollectorArgs{
        ApiClient: data.ApiClient,
        PageSize:  100,
        UrlTemplate: "api/v1/workspaces/{{ .Params.WorkspaceSlug }}/projects/{{ .Params.ProjectId }}/issues/",
        Query: func(reqData *api.RequestData) (url.Values, errors.Error) {
            query := url.Values{}
            if collector.GetSince() != nil {
                query.Set("updated_after", collector.GetSince().Format(time.RFC3339))
            }
            query.Set("per_page", strconv.Itoa(reqData.Pager.Size))
            query.Set("page", strconv.Itoa(reqData.Pager.Page))
            return query, nil
        },
        GetTotalPages: func(res *http.Response, args *api.ApiCollectorArgs) (int, errors.Error) {
            body := &struct{ Count int `json:"count"` }{}
            if err := api.UnmarshalResponse(res, body); err != nil {
                return 0, err
            }
            return int(math.Ceil(float64(body.Count) / float64(args.PageSize))), nil
        },
        ResponseParser: func(res *http.Response) ([]json.RawMessage, errors.Error) {
            body := &struct{ Results []json.RawMessage `json:"results"` }{}
            err := api.UnmarshalResponse(res, body)
            return body.Results, err
        },
    })
    if err != nil {
        return err
    }
    return collector.Execute()
}
```

### Step 8 — Extractor (Raw → Tool Layer)

```go
// tasks/issue_extractor.go
func init() {
    RegisterSubtaskMeta(&ExtractIssuesMeta)
}

var ExtractIssuesMeta = plugin.SubTaskMeta{
    Name:             "extractIssues",
    EntryPoint:       ExtractIssues,
    EnabledByDefault: true,
    Description:      "extract MyPlugin issues from raw data",
    DomainTypes:      []string{plugin.DOMAIN_TYPE_TICKET},
}

func ExtractIssues(taskCtx plugin.SubTaskContext) errors.Error {
    data := taskCtx.GetData().(*MyTaskData)

    extractor, err := api.NewApiExtractor(api.ApiExtractorArgs{
        RawDataSubTaskArgs: api.RawDataSubTaskArgs{
            Ctx: taskCtx,
            Params: MyApiParams{
                ConnectionId: data.Options.ConnectionId,
                ProjectId:    data.Options.ProjectId,
            },
            Table: RAW_ISSUE_TABLE,
        },
        Extract: func(row *api.RawData) ([]interface{}, errors.Error) {
            // Define inline API struct matching remote JSON shape
            var apiIssue struct {
                Id          string     `json:"id"`
                Title       string     `json:"title"`
                Description string     `json:"description"`
                State       struct {
                    Name string `json:"name"`
                } `json:"state"`
                Priority    string     `json:"priority"`
                CreatedAt   *time.Time `json:"created_at"`
                UpdatedAt   *time.Time `json:"updated_at"`
                CompletedAt *time.Time `json:"completed_at"`
                Assignees   []struct {
                    Id          string `json:"id"`
                    DisplayName string `json:"display_name"`
                } `json:"assignees"`
            }
            if err := json.Unmarshal(row.Data, &apiIssue); err != nil {
                return nil, errors.Default.Wrap(err, "unmarshalling issue")
            }

            issue := &models.MyIssue{
                ConnectionId: data.Options.ConnectionId,
                ProjectId:    data.Options.ProjectId,
                IssueId:      apiIssue.Id,
                Title:        apiIssue.Title,
                Description:  apiIssue.Description,
                Status:       apiIssue.State.Name,
                Priority:     apiIssue.Priority,
                CreatedDate:  apiIssue.CreatedAt,
                UpdatedDate:  apiIssue.UpdatedAt,
                ClosedDate:   apiIssue.CompletedAt,
            }
            // Map first assignee (multi-assignee not supported in v1)
            if len(apiIssue.Assignees) > 0 {
                issue.AssigneeId = apiIssue.Assignees[0].Id
                issue.AssigneeName = apiIssue.Assignees[0].DisplayName
            }

            return []interface{}{issue}, nil
        },
    })
    if err != nil {
        return err
    }
    return extractor.Execute()
}
```

### Step 9 — Converter (Tool Layer → Domain)

```go
// tasks/issue_convertor.go
func init() {
    RegisterSubtaskMeta(&ConvertIssuesMeta)
}

var ConvertIssuesMeta = plugin.SubTaskMeta{
    Name:             "convertIssues",
    EntryPoint:       ConvertIssues,
    EnabledByDefault: true,
    Description:      "convert MyPlugin issues to DevLake domain model",
    DomainTypes:      []string{plugin.DOMAIN_TYPE_TICKET},
}

func ConvertIssues(subtaskCtx plugin.SubTaskContext) errors.Error {
    data := subtaskCtx.GetData().(*MyTaskData)
    db := subtaskCtx.GetDal()

    // NOTE: arg count/order to Generate() must exactly match the gorm:"primaryKey"
    // fields declared on the model in Step 4 (ConnectionId, IssueId — 2 args, ProjectId excluded).
    issueIdGen := didgen.NewDomainIdGenerator(&models.MyIssue{})
    boardIdGen := didgen.NewDomainIdGenerator(&models.MyProject{})
    boardId := boardIdGen.Generate(data.Options.ConnectionId, data.Options.ProjectId)

    converter, err := api.NewStatefulDataConverter(&api.StatefulDataConverterArgs[models.MyIssue]{
        SubtaskCommonArgs: &api.SubtaskCommonArgs{
            SubTaskContext: subtaskCtx,
            Table:          RAW_ISSUE_TABLE,
            Params: MyApiParams{
                ConnectionId: data.Options.ConnectionId,
                ProjectId:    data.Options.ProjectId,
            },
        },
        Input: func(stateManager *api.SubtaskStateManager) (dal.Rows, errors.Error) {
            clauses := []dal.Clause{
                dal.Select("*"),
                dal.From(&models.MyIssue{}),
                // CRITICAL: Filter by BOTH connection_id AND project_id.
                // Filtering only by connection_id causes cross-project data leakage
                // when multiple projects exist under one connection.
                dal.Where("connection_id = ? AND project_id = ?",
                    data.Options.ConnectionId, data.Options.ProjectId),
            }
            if stateManager.IsIncremental() {
                if since := stateManager.GetSince(); since != nil {
                    clauses = append(clauses, dal.Where("updated_at >= ?", since))
                }
            }
            return db.Cursor(clauses...)
        },
        Convert: func(issue *models.MyIssue) ([]interface{}, errors.Error) {
            domainIssue := &ticket.Issue{
                DomainEntity: domainlayer.DomainEntity{
                    Id: issueIdGen.Generate(issue.ConnectionId, issue.IssueId),
                },
                IssueKey:       issue.IssueId,
                Title:          issue.Title,
                Type:           mapIssueType(issue.IssueType),
                OriginalType:   issue.IssueType,
                Status:         mapIssueStatus(issue.Status),
                OriginalStatus: issue.Status,
                Priority:       issue.Priority,
                AssigneeId:     issue.AssigneeId,
                AssigneeName:   issue.AssigneeName,
                CreatedDate:    issue.CreatedDate,
                UpdatedDate:    issue.UpdatedDate,
                ResolutionDate: issue.ClosedDate,
            }

            // Lead time: only when actually closed
            if issue.ClosedDate != nil && issue.CreatedDate != nil {
                mins := uint(issue.ClosedDate.Sub(*issue.CreatedDate).Minutes())
                if mins > 0 {
                    domainIssue.LeadTimeMinutes = &mins
                }
            }

            boardIssue := &ticket.BoardIssue{
                BoardId: boardId,
                IssueId: domainIssue.Id,
            }
            return []interface{}{domainIssue, boardIssue}, nil
        },
    })
    if err != nil {
        return err
    }
    return converter.Execute()
}

// mapIssueStatus normalises source status to DevLake standard values.
// DevLake recognises: TODO, IN_PROGRESS, DONE, OTHER
func mapIssueStatus(status string) string {
    switch strings.ToLower(status) {
    case "done", "closed", "completed", "resolved":
        return "DONE"
    case "in progress", "in_progress", "started":
        return "IN_PROGRESS"
    default:
        return "TODO"
    }
}

// mapIssueType normalises source type to DevLake standard values.
// DevLake recognises: BUG, REQUIREMENT, INCIDENT, QUESTION, EPIC, USER_STORY, TASK
func mapIssueType(issueType string) string {
    switch strings.ToLower(issueType) {
    case "bug", "defect":
        return "BUG"
    case "epic":
        return "EPIC"
    case "story", "user story":
        return "USER_STORY"
    case "task":
        return "TASK"
    default:
        return "REQUIREMENT"
    }
}
```

### Step 10 — PrepareTaskData (impl/impl.go)

```go
func (p MyPlugin) PrepareTaskData(taskCtx plugin.TaskContext, options map[string]interface{}) (interface{}, errors.Error) {
    var op tasks.MyOptions
    if err := helper.Decode(options, &op, nil); err != nil {
        return nil, errors.Default.Wrap(err, "could not decode options")
    }
    if op.ConnectionId == 0 {
        return nil, errors.BadInput.New("connectionId is required")
    }

    connection := &models.MyConnection{}
    connectionHelper := helper.NewConnectionHelper(taskCtx, nil, p.Name())
    if err := connectionHelper.FirstById(connection, op.ConnectionId); err != nil {
        return nil, errors.Default.Wrap(err, "failed to load connection")
    }

    apiClient, err := tasks.NewMyApiClient(taskCtx, connection)
    if err != nil {
        return nil, errors.Default.Wrap(err, "failed to create API client")
    }

    // Load scope if provided
    if op.ProjectId != "" {
        var scope models.MyProject
        db := taskCtx.GetDal()
        err = db.First(&scope, dal.Where("connection_id = ? AND project_id = ?", op.ConnectionId, op.ProjectId))
        if err != nil && db.IsErrorNotFound(err) {
            return nil, errors.Default.Wrap(err, fmt.Sprintf("project %s not found; import it first", op.ProjectId))
        }
        if err != nil {
            return nil, errors.Default.Wrap(err, "failed to load project")
        }
        if op.ScopeConfigId == 0 && scope.ScopeConfigId != 0 {
            op.ScopeConfigId = scope.ScopeConfigId
        }
    }

    // Load scope config
    if op.ScopeConfig == nil && op.ScopeConfigId != 0 {
        var sc models.MyScopeConfig
        if err := taskCtx.GetDal().First(&sc, dal.Where("id = ?", op.ScopeConfigId)); err != nil {
            return nil, errors.BadInput.Wrap(err, "failed to load scope config")
        }
        op.ScopeConfig = &sc
    }
    if op.ScopeConfig == nil {
        op.ScopeConfig = new(models.MyScopeConfig)
    }

    if op.PageSize <= 0 || op.PageSize > 100 {
        op.PageSize = 100
    }

    return &tasks.MyTaskData{Options: &op, ApiClient: apiClient}, nil
}
```

### Step 11 — Migration Scripts

```go
// models/migrationscripts/20260101000001_add_init_tables.go
type addInitTables20260101 struct{}

func (m *addInitTables20260101) Up(basicRes context.BasicRes) errors.Error {
    db := basicRes.GetDal()
    return db.AutoMigrate(
        &models.MyConnection{},
        &models.MyProject{},
        &models.MyScopeConfig{},
        &models.MyIssue{},
    )
}

func (m *addInitTables20260101) Version() uint64 { return 20260101000001 }
func (m *addInitTables20260101) Name() string    { return "myplugin init tables" }

// models/migrationscripts/register.go
func All() []plugin.MigrationScript {
    return []plugin.MigrationScript{
        new(addInitTables20260101),
        // Add new migrations here chronologically
    }
}
```

**Migration rules:**
- Version is a `uint64` timestamp: `YYYYMMDDHHMMSS`
- Never modify an existing migration — only add new ones
- Each migration is additive; never drop columns or tables in migrations
- Register all migrations in `All()` in `register.go`

### Step 12 — API Layer Init

```go
// api/init.go
var dsHelper *api.DsHelper[models.MyConnection, models.MyProject, models.MyScopeConfig]
var raProxy *api.DsRemoteApiProxyHelper[models.MyConnection]
var raScopeList *api.DsRemoteApiScopeListHelper[models.MyConnection, models.MyProject, MyRemotePagination]

func Init(br context.BasicRes, p plugin.PluginMeta) {
    basicRes = br
    vld = validator.New()
    dsHelper = api.NewDataSourceHelper[
        models.MyConnection,
        models.MyProject,
        models.MyScopeConfig,
    ](
        br,
        p.Name(),
        []string{"name"},                            // scope search fields
        func(c models.MyConnection) models.MyConnection { return c.Sanitize() },
        nil,
        nil,
    )
    raProxy = api.NewDsRemoteApiProxyHelper[models.MyConnection](dsHelper.ConnApi.ModelApiHelper)
    raScopeList = api.NewDsRemoteApiScopeListHelper[models.MyConnection, models.MyProject, MyRemotePagination](raProxy, listMyRemoteScopes)
}
```

### Step 13 — Connection API Handlers

```go
// api/connection_api.go — all delegated to dsHelper
var TestConnection      = dsHelper.ConnApi.TestConnection
var PostConnections     = dsHelper.ConnApi.PostConnections
var ListConnections     = dsHelper.ConnApi.ListConnections
var GetConnection       = dsHelper.ConnApi.GetConnection
var PatchConnection     = dsHelper.ConnApi.PatchConnection
var DeleteConnection    = dsHelper.ConnApi.DeleteConnection
var TestExistingConnection = dsHelper.ConnApi.TestExistingConnection
```

For `TestConnection`, the helper calls `SetupAuthentication` and makes a test request. Ensure the connection model implements `ApiAuthenticator`.

### Step 14 — ApiResources Map

```go
func (p MyPlugin) ApiResources() map[string]map[string]plugin.ApiResourceHandler {
    return map[string]map[string]plugin.ApiResourceHandler{
        "test":                                            {"POST": api.TestConnection},
        "connections":                                     {"POST": api.PostConnections, "GET": api.ListConnections},
        "connections/:connectionId":                       {"GET": api.GetConnection, "PATCH": api.PatchConnection, "DELETE": api.DeleteConnection},
        "connections/:connectionId/test":                  {"POST": api.TestExistingConnection},
        "connections/:connectionId/remote-scopes":         {"GET": api.RemoteScopes},
        "connections/:connectionId/scopes":                {"GET": api.GetScopeList, "PUT": api.PutScope},
        "connections/:connectionId/scopes/:scopeId":       {"GET": api.GetScope, "PATCH": api.UpdateScope, "DELETE": api.DeleteScope},
        "connections/:connectionId/scope-configs":         {"POST": api.CreateScopeConfig, "GET": api.GetScopeConfigList},
        "connections/:connectionId/scope-configs/:scopeConfigId": {
            "PATCH": api.UpdateScopeConfig, "GET": api.GetScopeConfig, "DELETE": api.DeleteScopeConfig,
        },
        // Optional: reverse lookup
        "scope-config/:scopeConfigId/projects":            {"GET": api.GetProjectsByScopeConfig},
    }
}
```

If this API surface changes, run `make swag` (from `backend/`) to regenerate Swagger docs — CI checks that the generated docs are up to date.

### Step 15 — Blueprint V200

```go
// api/blueprint_v200.go
func MakeDataSourcePipelinePlanV200(
    subtaskMetas []plugin.SubTaskMeta,
    connectionId uint64,
    bpScopes []*coreModels.BlueprintScope,
) (coreModels.PipelinePlan, []plugin.Scope, errors.Error) {
    connection, err := dsHelper.ConnSrv.FindByPk(connectionId)
    if err != nil {
        return nil, nil, err
    }
    scopeDetails, err := dsHelper.ScopeSrv.MapScopeDetails(connectionId, bpScopes)
    if err != nil {
        return nil, nil, err
    }
    _, err = helper.NewApiClientFromConnection(context.TODO(), basicRes, connection)
    if err != nil {
        return nil, nil, err
    }

    plan := make(coreModels.PipelinePlan, len(scopeDetails))
    scopes := make([]plugin.Scope, 0)
    idGen := didgen.NewDomainIdGenerator(&models.MyProject{})

    for i, sd := range scopeDetails {
        scope, scopeConfig := sd.Scope, sd.ScopeConfig
        task, err := helper.MakePipelinePlanTask(
            "myplugin",
            subtaskMetas,
            scopeConfig.Entities,
            MyTaskOptions{ConnectionId: scope.ConnectionId, ProjectId: scope.ProjectId},
        )
        if err != nil {
            return nil, nil, err
        }
        plan[i] = coreModels.PipelineStage{task}

        // Add domain-layer board if TICKET domain requested
        for _, entity := range scopeConfig.Entities {
            if entity == plugin.DOMAIN_TYPE_TICKET {
                scopes = append(scopes, &ticket.Board{
                    DomainEntity: domainlayer.DomainEntity{
                        Id: idGen.Generate(connection.ID, scope.ProjectId),
                    },
                    Name: scope.Name,
                })
                break
            }
        }
    }

    return plan, scopes, nil
}
```

---

## Frontend Wiring (config-ui) — required for the plugin to be usable at all

**A plugin that only has backend code is invisible in the DevLake UI.** Unlike the backend (which auto-discovers plugin directories), `config-ui/` requires explicit registration. `taiga` itself has no config-ui entry — don't assume "backend done" means "shippable."

1. **`config-ui/src/plugins/register/{plugin}/config.tsx`** — new file exporting an `IPluginConfig`:
   ```tsx
   import { DOC_URL } from '@/release';
   import { IPluginConfig } from '@/types';
   import Icon from './assets/icon.svg?react';
   import { Auth } from './connection-fields';

   export const MyPluginConfig: IPluginConfig = {
     plugin: 'myplugin',
     name: 'MyPlugin',
     icon: ({ color }) => <Icon fill={color} />,
     sort: 20,
     connection: {
       docLink: DOC_URL.PLUGIN.MYPLUGIN.BASIS,
       fields: ['name', /* Auth component */ 'proxy', 'rateLimitPerHour'],
     },
     dataScope: { title: 'Projects' },
     scopeConfig: {
       entities: ['TICKET'],
       transformation: { typeMappings: {} },
     },
   };
   ```
2. **`config-ui/src/plugins/register/{plugin}/assets/icon.svg`** — icon asset (imported via `?react`).
3. **`config-ui/src/plugins/register/{plugin}/connection-fields/`** and **`transformation-fields/`** — form components for the connection dialog and scope-config transformation UI (copy an existing plugin's shape, e.g. `jira/connection-fields`).
4. **`config-ui/src/plugins/register/index.ts`** — add the import and append the config object to the exported `pluginConfigs: IPluginConfig[]` array. Forgetting this step is the single most common reason a fully-working backend plugin "doesn't show up."

Documentation for end users does **not** live in this repository — `incubator-devlake` has no `docs/` folder. Per-plugin setup docs (and the `DOC_URL.PLUGIN.*` links referenced in `config.tsx`) belong in the separate `apache/incubator-devlake-website` repository.

---

## Domain ID Generation

Domain IDs must be deterministic and stable across syncs.

```go
import "github.com/apache/incubator-devlake/core/models/domainlayer/didgen"

issueIdGen := didgen.NewDomainIdGenerator(&models.MyIssue{})
id := issueIdGen.Generate(connectionId, issueId)
// Result: "myplugin:MyIssue:1:abc-123"

boardIdGen := didgen.NewDomainIdGenerator(&models.MyProject{})
boardId := boardIdGen.Generate(connectionId, projectId)
// Result: "myplugin:MyProject:1:proj-456"
```

**Rules (verified against `core/models/domainlayer/didgen/domain_id_generator.go`):**
- The ID prefix is `"<pluginName>:<StructName>"`, derived from the type's package path — you don't set this manually
- The number and order of arguments to `.Generate(...)` must exactly match the number and declaration order of fields tagged `gorm:"primaryKey"` on the model — passing the wrong count panics at runtime ("primary key values do not match, expected N, got M")
- IDs are stable — same inputs always produce the same output

---

## SubTaskMeta Best Practices

```go
var CollectIssuesMeta = plugin.SubTaskMeta{
    Name:             "collectIssues",          // camelCase, unique within plugin
    EntryPoint:       CollectIssues,            // matches var _ plugin.SubTaskEntryPoint = CollectIssues
    Required:         false,                    // true = always runs regardless of user's entity selection
    EnabledByDefault: true,
    Description:      "collect issues from remote API",
    DomainTypes:      []string{plugin.DOMAIN_TYPE_TICKET},
    // Optional — set if this subtask reads output of another:
    Dependencies:     []*plugin.SubTaskMeta{&ExtractIssuesMeta},
    DependencyTables: []string{RAW_ISSUE_TABLE},
    ProductTables:    []string{"_tool_myplugin_issues"},
    ForceRunOnResume: false,                     // true = re-run even if it finished before a resumed pipeline
}
```

Register all metas in `SubTaskMetas()` in `impl.go` (directly, or via `tasks.SubTaskMetaList` if using the `register.go` pattern). Order matters — collectors before extractors before converters.

---

## Known Pitfalls (verified against real plugin code, not hypothetical)

### 1. Cross-project data leakage — CRITICAL, currently live in Taiga

```go
// WRONG — this is what Taiga's real issue_convertor.go does today:
dal.Where("connection_id = ?", data.Options.ConnectionId)

// CORRECT — what GitHub's issue_convertor.go does:
dal.Where("connection_id = ? AND project_id = ?",
    data.Options.ConnectionId, data.Options.ProjectId)
```
Don't copy Taiga's converter WHERE clause. Copy GitHub's or GitLab's.

### 2. Weak pagination — currently live in Taiga

```go
// WRONG — Taiga's real collector: PageSize: 1000, no GetTotalPages, no page query param
// CORRECT — GitLab/GitHub: NewStatefulApiCollector + GetTotalPages + page/per_page query params
```

### 3. Full re-collection every run instead of incremental sync

Use `helper.NewStatefulApiCollector` and check `collector.GetSince()` in your `Query` function (see Step 7). Plain `NewApiCollector` has no state and re-fetches everything on every pipeline run — fine for a first draft, unacceptable for production on large data sources.

### 4. Missing or unset rate limiting

Passing `nil` for the rate limiter in `CreateAsyncApiClient` means unbounded concurrency against the remote API. Always construct an `ApiRateLimitCalculator`, and prefer a `DynamicRateLimit` callback that reads the API's actual rate-limit response headers (see Step 6).

### 5. Scope config mappings must be implemented, not stubbed

If you define `TypeMappings` on `ScopeConfig`, you must apply them in converters. Unused config fields mislead users.

### 6. Partial field mapping

Map every extracted field to the domain model. Fields extracted but not converted are silently lost and will confuse users.

### 7. Inconsistent status normalisation

All entity types in the same plugin should normalise status using the same helper function. Mixing closed/open for some types and raw status for others breaks dashboard queries.

### 8. Missing secret preservation in PATCH

If `MergeFromRequest` is not implemented on the connection model, a PATCH request that omits the token/password will clear the stored credential.

### 9. Table naming

All `_tool_*` tables must match `TableName()` on the model struct. Mismatches cause silent runtime errors.

### 10. Forgetting `GetTablesInfo()`

Every tool-layer model must be listed in `GetTablesInfo()`, or `backend/plugins/table_info_test.go` fails in CI.

### 11. Forgetting config-ui registration

A backend-complete plugin with no entry in `config-ui/src/plugins/register/index.ts` is invisible in the UI — see Frontend Wiring above.

### 12. Cross-plugin Go imports

Plugins must be independent. Never import one plugin's package from another; share code via `core/` or `helpers/pluginhelper/`.

---

## Testing Strategy

### Unit Tests (extractors and converters)

Test that JSON fixtures produce exactly the expected tool-layer and domain-layer rows.

```go
func TestExtractIssues(t *testing.T) {
    rawData := `{"id":"abc","title":"Fix crash","state":{"name":"In Progress"}}`
    rows, err := extractIssue([]byte(rawData), 1, "proj-1")
    require.NoError(t, err)
    require.Len(t, rows, 1)
    issue := rows[0].(*models.MyIssue)
    assert.Equal(t, "Fix crash", issue.Title)
    assert.Equal(t, "In Progress", issue.Status)
}
```

### E2E Snapshot Tests (full pipeline)

Located in `{plugin}/e2e/`. These are the most valuable tests. Verified accurate against `backend/helpers/e2ehelper/data_flow_tester.go` and `taiga/e2e/issue_test.go`:

1. Import CSV fixture into `_raw_*` table via `NewDataFlowTester(t, pluginName, pluginMeta)` + `ImportCsvIntoRawTable`
2. Run extractor subtask via `Subtask(...)`
3. Compare `_tool_*` against golden snapshot via `VerifyTableWithOptions(..., TableOptions{CSVRelPath, IgnoreTypes: []interface{}{common.NoPKModel{}}})`
4. Run converter subtask
5. Compare domain tables against golden snapshot

```go
func TestIssues(t *testing.T) {
    var testIssue e2ehelper.DataFlowTester
    testIssue.ImportCsvIntoRawTable("./snapshot_tables/_raw_myplugin_api_issues.csv",
        "_raw_myplugin_api_issues")
    testIssue.Subtask(tasks.ExtractIssuesMeta, taskData)
    testIssue.VerifyTableWithOptions(models.MyIssue{}, e2ehelper.TableOptions{
        CSVRelPath: "./snapshot_tables/_tool_myplugin_issues.csv",
    })
    testIssue.Subtask(tasks.ConvertIssuesMeta, taskData)
    testIssue.VerifyTableWithOptions(ticket.Issue{}, e2ehelper.TableOptions{
        CSVRelPath: "./snapshot_tables/issues.csv",
    })
}
```

Write snapshot E2E tests for every entity before shipping.

---

## Local Verification Before Opening a PR

Run these from the repo (verified against `.github/workflows/*.yml` and `backend/Makefile`):

```bash
cp env.example .env                          # once, if not already done

cd backend
make mock                                    # regenerate mocks — required before lint
make lint                                    # golangci-lint run (backend/.golangci.yaml)
make unit-test                               # make build-python && unit tests
make swag                                    # ONLY if you changed ApiResources()/API shapes — regenerates Swagger docs, checked in CI

# from repo root, needs Postgres / E2E_DB_URL configured:
make e2e-test-go-plugins
make e2e-test
```

**Lint gotchas** (from `backend/.golangci.yaml`): `revive` runs at error severity and enforces `unhandled-error`, `error-strings` (error strings must be lowercase, no trailing punctuation), `context-as-argument`, `modifies-parameter`. `revive` is *not* enforced in `models/`, `api/`, `migration/`, `errors/`, `logger/` — but it is enforced in `tasks/`.

**License header enforcement**: not Apache Rat — CI uses `apache/skywalking-eyes` (`.github/workflows/asf-header-check.yml`). There's no local Makefile target to dry-run it; visually match the header below exactly, character for character.

**Commit message format**: `.github/workflows/commit-msg.yml` enforces conventional-commit style — `feat|fix|build|chore|docs|style|refactor|perf|test|ci: description`. Non-conforming commit messages fail CI on the PR.

There is no DCO `Signed-off-by` requirement in this repo; standard ASF contribution norms apply (see the PR template checkboxes).

---

## Checklist Before Submitting a Plugin PR

- [ ] Confirmed plugin category (REST datasource vs. webhook vs. calculator) and followed the matching template, not a mismatched one
- [ ] All required plugin interfaces implemented with compile-time assertion in `impl.go`
- [ ] `RootPkgPath()` matches actual Go module path
- [ ] `TableName()` defined on every model
- [ ] Every tool-layer model has `NoPKModel` or `Model` embedded (for timestamps + raw data origin)
- [ ] Connection sanitises secrets before returning (API/GET never leaks credentials)
- [ ] `MergeFromRequest` preserves existing secrets on PATCH
- [ ] Collectors use `NewStatefulApiCollector` with real pagination and `GetSince()`-driven incremental queries
- [ ] API client has a real `ApiRateLimitCalculator` (not `nil`)
- [ ] Converters filter on both `connection_id` AND `project_id` (or equivalent scope ID)
- [ ] `didgen.Generate(...)` argument count/order matches the model's `gorm:"primaryKey"` fields exactly
- [ ] Status normalisation is consistent across all entity types
- [ ] All extracted fields are mapped to domain models (no silent data loss)
- [ ] Migration scripts added for every new table; `All()` updated
- [ ] `GetTablesInfo()` lists every model — verify `backend/plugins/table_info_test.go` passes
- [ ] `SubTaskMetas()` lists every subtask in collect → extract → convert order
- [ ] E2E snapshot tests written for every entity
- [ ] `Close()` releases the async API client
- [ ] Apache license header in every `.go` file (byte-exact — see below)
- [ ] **`config-ui/src/plugins/register/{plugin}/config.tsx`** created and registered in **`config-ui/src/plugins/register/index.ts`** — plugin is visible and connectable in the UI
- [ ] `make swag` re-run if `ApiResources()` changed
- [ ] `make lint`, `make unit-test` pass locally
- [ ] Commit messages follow conventional-commit format (CI-enforced)
- [ ] No cross-plugin Go imports

---

## Domain Layer Quick Reference

| Domain | Type | Key Fields |
|---|---|---|
| `ticket.Board` | Board/project | `Id`, `Name`, `Description`, `Url` |
| `ticket.Issue` | Work item | `Id`, `IssueKey`, `Title`, `Type`, `Status`, `Priority`, `AssigneeId`, `CreatedDate`, `UpdatedDate`, `ResolutionDate`, `LeadTimeMinutes`, `StoryPoint` |
| `ticket.BoardIssue` | Board-issue link | `BoardId`, `IssueId` |
| `ticket.Sprint` | Sprint/iteration | `Id`, `Name`, `StartedDate`, `CompletedDate`, `State` |
| `code.Repo` | Repository | `Id`, `Name`, `HttpUrlToRepo`, `CreatedDate` |
| `code.PullRequest` | PR/MR | `Id`, `Title`, `Status`, `MergedDate`, `AuthorId` |
| `code.Commit` | Commit | `Sha`, `Message`, `AuthorName`, `AuthoredDate` |
| `devops.CicdPipeline` | Pipeline run | `Id`, `Name`, `Result`, `Status`, `StartedDate`, `FinishedDate` |

Import paths:
```go
"github.com/apache/incubator-devlake/core/models/domainlayer"        // DomainEntity
"github.com/apache/incubator-devlake/core/models/domainlayer/ticket"
"github.com/apache/incubator-devlake/core/models/domainlayer/code"
"github.com/apache/incubator-devlake/core/models/domainlayer/devops"
"github.com/apache/incubator-devlake/core/models/domainlayer/didgen"
```

---

## Apache License Header

Every `.go` file (and `config-ui` `.ts`/`.tsx` file, in `/* ... */` or `// ...` form) must start with, byte-for-byte:

```go
/*
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
*/
```
