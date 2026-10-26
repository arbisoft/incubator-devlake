# GitLab Dashboards: known issues and design decisions

These points are **known and accepted**. Each one was a deliberate choice or a deferred item. Reviewers (human or
automated) don't need to flag them again; open a follow-up for one of them instead. The numbers were measured on the
local DB on 2026-10-26 and only show the scale.

Metric definitions are in [README.md](README.md).

## Design decisions

| Area | Decision | Why |
| --- | --- | --- |
| Reviews on imported MRs | Per-reviewer panels (B id=1, B id=5 reviews, C id=10, J 3.4) leave out reviews on MRs imported from GitHub. C id=9 keeps them. | The import account approved those MRs while importing, so the reviews aren't its own activity. C id=9 counts MRs, not reviewers, and an imported review is a real decision on its MR. |
| Bots on A | Bot commits and pipelines count like any other author's: under All, and under the bot when it's in the developer list. | A's Total Builds must match I panel 105. Commits follow the same rule so the two panels agree. |
| Draft filter on I/J 4.1 and 4.4 | J has I's open-draft filter on 4.1 and 4.4, although those panels only count CLOSED or MERGED MRs, so the filter changes nothing. | Keeps I and J's SQL identical for panels that share an id and title. |
| A's MRs Raised | Stays Merged + Open + Closed + Draft. | Draft is its own slice in A's pie. I and J's "New MRs" leave open drafts out instead. |
| I/J copies | Fixes to a panel that I and J share (4.4 first point, 4.6/4.8 units, 4.7 wording) go to both. | J's panels are copies of I's; they must not drift apart. |
| Unassigned on C | C's developer list includes Unassigned, but it matches no MR. | A's MR links pass the developer selection to C. Every MR has an author, so Unassigned alone shows nothing there. |
| Unmatched commit authors on J 3.5/3.6 | Commits that match no GitLab account are kept under the git author name, and only show under All. | Same as GitHub J. Side effect: one person can show twice, once under their account and once under a git name that doesn't match it (e.g. email `first.last@…` with username `first-last`). |
| Grouping on H and J | Per-person panels group by account id, not display name. | Grouping by name would merge different people who share a name. Two accounts of one person on two connections show as two bars. |
| `not_imported_mr` | The import account and date stay inside the one constant instead of separate constants. | Fewer moving parts. The constant's description and the README explain how to edit it. |
| Bot check | `REGEXP '^(project\|group)_[0-9]+_bot_'` is written inline in every query, not as a shared constant. | The checks run on different aliases and columns (`ba.user_name`, `pr.author_name`, `a.user_name` in a `HAVING`). |
| Label lists | `bug_issue` and `in_progress_issue` hold this org's labels as plain names. There's no `LIKE '%::bug'` pattern matching, and `security` and `debug` stay in the bug list. | Admins replace the lists for their install (see the README). Guessing patterns could misclassify issues. |
| Bar charts by `$interval` | The first and last bars can cover only part of a week or month. | They're labelled by period. Only 4.4 (a timeseries) clamps its first point to the range start. |
| A's drill-down into I | A link from A with one developer selected opens I unfiltered. | I has no developer variable, the same as GitHub I. With All the numbers match exactly. |
| In-progress pipelines | Running and pending pipelines show as Unknown, dated by created date. They aren't split out as a separate status. | They move to SUCCESS or FAILURE once they finish. The descriptions say so. |

## Open items (deferred)

| Item | Detail | Possible fix |
| --- | --- | --- |
| B id=5 all-time speed | Contribution Detail takes about 1.6–2.4s over an all-time range (about 0.8s for one year). Most of the time goes to the per-row merge-commit check (`commit_parents` count) in `mr_commits`. | Run the merge check after `GROUP BY prc.commit_sha` (saves about 0.3s), or precompute merge commits once. Apply it to B id=3 and A id=16 too, since they share the pattern. |
| Authors with no account row | B, C and G inner-join `accounts` on the MR author, so MRs whose author has no `accounts` row drop out. A doesn't. All-time, A counts 10 more MRs than C, and G is 3 short of C id=6. | `LEFT JOIN accounts` with a username or "(unmapped)" fallback, as J 3.4 does. |
| Reviews on bot-authored MRs | J 3.4 leaves them out (like J's other MR panels); B id=1 and C id=10 still count them (about 35 approvals over a year). | Add the bot-author check to B id=1 and C id=10, or drop it from J 3.4. Pick one rule. |
| Commit email local part | Matching compares the email's local part to the username exactly, so `first.last` doesn't match `first-last`. | Normalise `.`, `-` and `_` on both sides before comparing. |
| Duplicate names on H and J | One person with accounts on two connections shows as two bars with split counts. | Group by resolved name, or append the username when names collide. |
| SonarQube coverage per MR | GitLab MRs have no `head_commit_sha`, so I 7.2 shows the repo's current coverage. Its "MR commit match" branch never fires. | Join on `merge_commit_sha`, which the converter fills. |
| Other issue-type label lists | D and E's Refactoring, Documentation, R&D, Reviews and Tasks label lists are still inline in their `issue_types` CTE. | Move them into hidden constants like `bug_issue`. |
| Week start | C, D, E and F's `$__timeGroup` weeks start on Thursday; I and J's start on Monday. | Bucket C, D, E and F by calendar, like I and J. |
