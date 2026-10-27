---
name: create-ticket
description: Create a US-N story on projects.arbisoft.com (Plane, DevLake project) for the change on the current branch, assigned to the person running it, with a chosen status and priority. Use when the user runs /create-ticket or asks to create a story/ticket for this change.
disable-model-invocation: true
argument-hint: "[status=<Backlog|Todo|In Progress|Done|Cancelled>] [priority=<urgent|high|medium|low|none>]"
---

# Create ticket

The original request this skill comes from:

> create a story of this change on `projects.arbisoft.com`. Assign it to me, and set status in progress.

Arguments (may be empty): $ARGUMENTS

## Parameters

- `status`: the Plane state the ticket gets once it's created. Match it to a state name case-insensitively
  (Backlog, Todo, In Progress, Done, Cancelled). Default: `In Progress`.
- `priority`: the Plane priority the ticket gets once it's created (`urgent`, `high`, `medium`, `low`, `none`).
  Default: `high`.

Arguments come as `status=... priority=...` or in plain words (e.g. "todo, low priority"). If a parameter is
missing, or its value doesn't match any Plane state or priority, use the default. Say which values you used.

## Plane facts

- Plane instance, workspace slug `arbisoft`, project DevLake (identifier `DEVLAKE`), project id
  `99c3013b-7e8a-4dc4-bea8-8685eed51753`. API base: `/api/workspaces/arbisoft/projects/<project id>`.
- The assignee is whoever is logged in to Plane in the browser: get their id from `GET /api/users/me/` (`id`).
- There's no API key locally. Use Claude in Chrome (the user is logged in) and call Plane's internal API from
  the page with `fetch`. Writes need an `X-CSRFToken` header, from
  `(await fetch('/auth/get-csrf-token/').then(r=>r.json())).csrf_token`. The `csrftoken` cookie isn't readable.
- The javascript tool blocks results that contain URLs, cookies or query strings
  (`[BLOCKED: Cookie/query string data]`). Return only ids, names and statuses, or strip URLs and `?=&` from
  text before returning it.
- Story convention: a parent issue named `US-N: Title Case`, whose description holds a user story, an
  acceptance criteria list and a PR link. Don't copy the description of the latest story as a template; some
  (like US-24) are pasted plans, not the standard layout.

## Steps

1. **Understand the change.** Run `git status -sb`, `git log main..HEAD --stat` and `git show` on the branch's
   commits. For big JSON diffs (Grafana dashboards), don't dump the diff: read the changed parts with a short
   Python script (e.g. new templating variables, how many panels have queries, what each query now filters on).
   Include uncommitted changes if there are any, and say so.
2. **Find the links.** Read the repos from `git remote -v`; never guess a repo name. The branch is pushed to
   `origin` (usually the person's fork), and PRs are opened against `arbisoft/incubator-devlake`. Look for an
   open PR whose head is `<fork owner>:<branch>`: use `gh pr list --head <branch>` if `gh` is installed,
   otherwise the GitHub REST API (`GET repos/arbisoft/incubator-devlake/pulls?head=<owner>:<branch>&state=all`)
   with curl and the token from `git credential fill` (host github.com), passing the auth header on stdin
   (`curl -K -`) so it doesn't show up in the process list. If there's no PR, link the branch on the fork
   (`https://github.com/<origin repo>/tree/<branch>`) with the short commit SHA, and write "PR: to be added".
   If the branch isn't pushed, say so and link nothing.
3. **Open Plane.** Load the Chrome tools in one ToolSearch call (`tabs_context_mcp`, `navigate`,
   `tabs_create_mcp`, `javascript_tool`), call `tabs_context_mcp` with `createIfEmpty: true`, and navigate the
   group's tab to `https://projects.arbisoft.com/arbisoft/projects/<project id>/issues/`.
4. **Look up the assignee, states and the next US number** in one `javascript_tool` call:
   `GET /api/users/me/` (return `id` and `display_name`), `GET <base>/states/` (return `[id, name, group]`) and `GET <base>/issues/?per_page=1000&cursor=1000:0:0`, following `next_cursor` while
   `next_page_results` is true. Results may be an array or an object of arrays, so flatten them. Return the
   five highest `US-N` names with their `sequence_id`. The new story is the highest N + 1. Also check that no
   story already covers this branch or PR; if one does, stop and ask the user instead of creating a duplicate.
5. **Write the description** as HTML:
   - `<h2>User story</h2>`: "As a <role>, I want <capability>, so that <benefit>."
   - `<h2>Acceptance criteria</h2>`: a `<ul>` of checkable behaviours, drawn from what the diff actually does
     (defaults, scoping, fallbacks, which panels/endpoints are affected, unchanged behaviour when unfiltered).
   - `<h2>Implementation</h2>`: the main files in `<code>`, the PR link, or the branch link plus commit and
     "PR: to be added".
6. **Create the issue** with `POST <base>/issues/`, sending `X-CSRFToken` and JSON:
   `{name: "US-N: <Title Case>", description_html, state_id: <state id for status>, priority: <priority>,
   assignee_ids: [<id from /api/users/me/>]}`. Return only `status`, `sequence_id`, `id`,
   `state_id`, `priority` and `assignee_ids`, and check they match what you sent (expect HTTP 201).
7. **Check the links** in the description against the git remotes. Fix any mistake with
   `PATCH <base>/issues/<id>/` (`{description_html}`, expect 204), then re-fetch and confirm the fix.
8. **Report** to the user: the ticket key and title, status, priority and assignee, a short summary of the
   description, any fixes made after creating it, and whether a PR link still needs adding.
