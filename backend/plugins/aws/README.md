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
# AWS

Collects delivery and cost data from AWS: pipelines and runs from CodePipeline, builds and build phases from CodeBuild, signals from CodeBuild logs (Trivy totals, smoke tests, rollbacks) and, optionally, spend from Cost Explorer. Infrastructure health (CPU, memory, uptime, alarms) is not collected.

## Authentication modes

- **Assume role (recommended).** DevLake holds a long-lived key for a small "broker" IAM user. That user can do nothing except assume a read-only role in your account. Every request uses short-lived credentials from that role, and DevLake refreshes them before they expire.
- **Access key (fallback).** DevLake uses one IAM user key with the read-only permissions directly. Use it only when a role can't be created.

In assume-role mode the access key ID and secret you enter belong to the broker user, not to the role.

## Set up with a role

1. Create the connection in DevLake with the broker user's access key, the regions to read and the auth type "Assume role". Leave the role ARN empty for now and save.
2. Open the connection page and copy the External ID and the three policies: the trust policy, the permission policy and the broker policy.
3. In IAM, create a role that uses the trust policy and the permission policy.
4. Attach the broker policy to the broker IAM user.
5. Enter the role ARN on the connection page.
6. Select Test connection and check every row.
7. Save.

For the access-key fallback, create an IAM user, attach the permission policy and enter its key. Test connection works the same way.

## Security

- The access key ID, secret, session token and External ID are encrypted at rest.
- The secret and session token are never returned by the API, and the access key ID is returned masked.
- The External ID is created by DevLake when the connection is saved and can't be changed. Create a new connection if you need a new one.

## Regions

Regions are required and nothing is assumed: pick every region that holds pipelines. Pipelines and builds are read per region. Cost Explorer is a global service served from `us-east-1`.

## Permissions

Required permissions must be allowed for Test connection to pass. Optional ones turn a feature off when denied.

| Permission | Needed | Used for |
| --- | --- | --- |
| `codepipeline:ListPipelines` | required | Lists pipelines for the scope picker. |
| `codepipeline:GetPipeline` | required | Reads stages, actions, source repos and triggers. |
| `codepipeline:ListTagsForResource` | optional | Reads pipeline tags. |
| `codepipeline:ListPipelineExecutions` | required | Reads pipeline runs. |
| `codepipeline:ListActionExecutions` | required | Reads stage and action runs and their linked builds. |
| `codebuild:ListProjects` | required | Lists CodeBuild projects. |
| `codebuild:BatchGetProjects` | required | Reads CodeBuild project configuration. |
| `codebuild:ListBuildsForProject` | optional | Lists builds per project. |
| `codebuild:BatchGetBuilds` | required | Reads builds, phases and failure reasons. |
| `logs:GetLogEvents` | optional | Reads build log signals such as Trivy, smoke tests and rollbacks. |
| `ce:GetCostAndUsage`, `ce:GetDimensionValues`, `ce:GetTags`, `ce:GetCostForecast` | only with Cost Explorer on | Reads real spend by service and the forecast. |
| `sts:AssumeRole` | assume-role mode | Lets the broker user borrow the role. It is attached to the broker user, not to the role. |

`logs:GetLogEvents` is limited to the `/aws/codebuild/*` log groups in the generated policy. Cost Explorer bills each request, so Test connection makes a single `GetCostAndUsage` call and does not call the other three.

## Build log signals

When the scope config sets a Trivy, smoke test or rollback pattern, the connector reads each finished CodeBuild log once, parses it in memory and keeps only the parsed values: Trivy totals by severity and target, smoke test results, rollback lines and how often each pattern matched. The log text is never stored. Smoke test and rollback patterns apply only to builds of actions that match the deployment pattern. Lines that echo a command (`echo ` or `${`) are ignored.

CloudWatch Logs expire (about 14 days on the dev account), so signals start from go-live and builds whose log is already gone are recorded as not available rather than as zero matches. A normal run reads only builds that were never read. A full re-sync reads every build again, so changed log patterns are applied to builds still inside log retention; builds whose log has expired keep their earlier results.

## Calculated cost

CodeBuild builds and V2 pipeline actions get an estimated cost from the public AWS Price List, refreshed at most once a day per region and kept in `_tool_aws_prices`. Billed minutes are the duration rounded up to whole minutes. Only CI/CD compute is estimated: free tiers are ignored, and Lambda and fleet builds, V1 pipelines, approval actions and custom actions are not modelled. A usage type without a price leaves the cost empty rather than zero. The Price List is only reachable in the `aws` partition.

## Cost Explorer

With Cost Explorer on, the connector stores daily spend by service for the previous and the current month and the forecast to the end of the month, once a day per connection. Cost Explorer bills every request, so a night costs about two calls per connection (more only when the spend by service spans several pages) and nothing is retried. If access is denied the connector logs one warning and carries on without spend data.

## Good to know

- Do not add two connections to the same AWS account to one project: the same deployments are collected twice and double-counted.
- AWS keeps 12 months of run history. Runs older than that stay in DevLake after a full re-sync on purpose, so history is not lost.
