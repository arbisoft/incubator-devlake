/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardPath = new URL(
  "./ClaudeAdoptionPrometheus.json",
  import.meta.url
);

const getVariable = (dashboard, name) =>
  dashboard.templating.list.find((variable) => variable.name === name);

test("keeps legacy OTel teams in the All-project dashboard view", async () => {
  const dashboard = JSON.parse(await readFile(dashboardPath, "utf8"));
  const teams = getVariable(dashboard, "otel_teams");

  assert.ok(teams);
  assert.equal(teams.definition, teams.query);
  assert.match(
    teams.query,
    /FROM _tool_claude_code_otel_connections c LEFT JOIN _tool_claude_code_otel_connection_projects cp/
  );
  assert.match(teams.query, /c\.status = 'active'/);
  assert.match(teams.query, /\$\{project:sqlstring\} = '\.\*'/);
  assert.match(teams.query, /cp\.project_name = \$\{project:sqlstring\}/);
  assert.doesNotMatch(teams.query, /\$\{project:raw\}/);
});
