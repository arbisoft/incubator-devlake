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
import { execFileSync } from 'child_process';

import { E2E_USER_PREFIX } from './env';
import { assertE2eEmail } from './grafana-safety';

interface DbCredentials {
  user: string;
  password: string;
  database: string;
  host: string;
  port: string;
}

// Credentials come from E2E_DB_USER/PASSWORD/NAME, falling back to the app DB_URL (not E2E_DB_URL, which targets the Go test database).
function dbCredentials(): DbCredentials {
  let parsed: URL | undefined;
  if (process.env.DB_URL) {
    try {
      parsed = new URL(process.env.DB_URL);
    } catch {
      parsed = undefined;
    }
  }
  const user = process.env.E2E_DB_USER ?? (parsed ? decodeURIComponent(parsed.username) : '');
  const password = process.env.E2E_DB_PASSWORD ?? (parsed ? decodeURIComponent(parsed.password) : '');
  const database = process.env.E2E_DB_NAME ?? (parsed ? parsed.pathname.replace(/^\//, '') : '');
  if (!user || !database) {
    throw new Error(
      'Set E2E_DB_USER, E2E_DB_PASSWORD and E2E_DB_NAME (or a DB_URL) so the e2e suite can reach the app database',
    );
  }
  return {
    user,
    password,
    database,
    host: process.env.E2E_DB_HOST ?? '127.0.0.1',
    port: process.env.E2E_DB_PORT ?? '3306',
  };
}

export function dbDsn(): string {
  const { user, password, database, host, port } = dbCredentials();
  return process.env.E2E_DB_DSN ?? `${user}:${password}@tcp(${host}:${port})/${database}?parseTime=true`;
}

function assertLocalTarget(): void {
  const dockerHost = process.env.DOCKER_HOST;
  if (dockerHost && !dockerHost.startsWith('unix://')) {
    throw new Error('Refusing to run SQL: DOCKER_HOST points at a remote Docker daemon');
  }
  const host = dbCredentials().host;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`Refusing to run SQL: E2E_DB_HOST=${host} is not a local address`);
  }
}

export function runSql(sql: string): string {
  assertLocalTarget();
  const { user, password, database } = dbCredentials();
  const container = process.env.E2E_MYSQL_CONTAINER ?? 'incubator-devlake-mysql-1';
  const docker = process.env.E2E_DOCKER_BIN ?? 'docker';
  try {
    return execFileSync(
      docker,
      ['exec', '-i', '-e', 'MYSQL_PWD', container, 'mysql', '-u', user, '--batch', '--skip-column-names', database],
      { input: sql, encoding: 'utf-8', env: { ...process.env, MYSQL_PWD: password }, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch (err) {
    const stderr = (err as { stderr?: Buffer | string }).stderr?.toString().replace(/\s+/g, ' ').trim();
    throw new Error(`SQL execution via docker container "${container}" failed: ${stderr || (err as Error).message}`, {
      cause: err,
    });
  }
}

const TEST_LOGIN_LIKE = `${E2E_USER_PREFIX.replace(/_/g, '\\\\_')}%`;

// Clears login throttle buckets and removes only the local users whose login name starts with E2E_USER_PREFIX.
export function resetLocalAuthState(): void {
  runSql(`
    TRUNCATE TABLE auth_local_login_attempts;
    DELETE i FROM auth_access_identities i JOIN auth_local_credentials c ON c.access_user_id = i.access_user_id WHERE c.login_name LIKE '${TEST_LOGIN_LIKE}';
    DELETE u FROM auth_access_users u JOIN auth_local_credentials c ON c.access_user_id = u.id WHERE c.login_name LIKE '${TEST_LOGIN_LIKE}';
    DELETE FROM auth_local_credentials WHERE login_name LIKE '${TEST_LOGIN_LIKE}';
  `);
}

// Removes the e2e- email users that tests add through the API and their audit rows (they have no identities until a first login).
export function deleteEmailUsersNamedLike(prefix: string): void {
  const pattern = `${prefix.replace(/'/g, "''")}%`;
  runSql(`
    DELETE FROM auth_access_users WHERE email LIKE '${pattern}';
    DELETE FROM auth_access_audit_events WHERE target_email LIKE '${pattern}';
  `);
}

export function countLocalCredentials(loginName: string): number {
  return Number(
    runSql(`SELECT COUNT(*) FROM auth_local_credentials WHERE login_name = '${loginName.replace(/'/g, "''")}';`).trim(),
  );
}

export function readGrafanaProjectMappings(login: string): string[] {
  if (login !== 'admin') {
    assertE2eEmail(login);
  }
  const escapedLogin = login.replace(/'/g, "''");
  let output: string;
  try {
    output = runSql(
      `SELECT project_name FROM user_project_mapping WHERE user_login = '${escapedLogin}' ORDER BY project_name;`,
    );
  } catch {
    throw new Error('Grafana project mapping lookup failed.');
  }
  return output.split(/\r?\n/).filter(Boolean);
}

export function passwordHashFor(loginName: string): string {
  return runSql(
    `SELECT password_hash FROM auth_local_credentials WHERE login_name = '${loginName.replace(/'/g, "''")}';`,
  ).trim();
}

// Whether the local credential still forces a password change; undefined when the login has no credential.
export function mustChangePasswordFor(loginName: string): boolean | undefined {
  const value = runSql(
    `SELECT must_change_password FROM auth_local_credentials WHERE login_name = '${loginName.replace(/'/g, "''")}';`,
  ).trim();
  return value === '' ? undefined : value === '1';
}

// Number of hidden (removed from the UI, audit row kept) OTel connections of a team.
export function hiddenOtelConnectionCount(teamName: string): number {
  return Number(
    runSql(
      `SELECT COUNT(*) FROM _tool_claude_code_otel_connections WHERE team_name = '${teamName.replace(/'/g, "''")}' AND hidden_at IS NOT NULL;`,
    ).trim(),
  );
}

// Removes the connections of a test team with their credentials and project placements, after the API has revoked and hidden them.
export function deleteOtelConnectionsOfTeam(teamName: string): void {
  const team = teamName.replace(/'/g, "''");
  runSql(`
    DELETE FROM _tool_claude_code_otel_connection_projects WHERE connection_id IN (SELECT id FROM _tool_claude_code_otel_connections WHERE team_name = '${team}');
    DELETE FROM _tool_claude_code_otel_credentials WHERE connection_id IN (SELECT id FROM _tool_claude_code_otel_connections WHERE team_name = '${team}');
    DELETE FROM _tool_claude_code_otel_connections WHERE team_name = '${team}';
  `);
}

// Pipelines outlive their blueprint and cannot be deleted through the API, so cleanup removes the rows named after test blueprints.
export function deletePipelinesNamedLike(prefix: string): void {
  const pattern = `${prefix.replace(/'/g, "''")}%`;
  runSql(`
    DELETE FROM _devlake_tasks WHERE pipeline_id IN (SELECT id FROM _devlake_pipelines WHERE name LIKE '${pattern}');
    DELETE FROM _devlake_pipelines WHERE name LIKE '${pattern}';
  `);
}

export interface ReadinessSeed {
  boardId: string;
  repoId: string;
}

// Identifiers of the collected-data rows a readiness spec seeds; every id embeds the token so cleanup can find it.
export const readinessSeedIds = (token: string): ReadinessSeed => ({
  boardId: `jira:${token}-board`,
  repoId: `github:${token}-repo`,
});

// Gives the project a Jira board with one issue and a GitHub repo with one pull request, the minimum the readiness report counts as collected.
export function seedProjectCollectedData(projectName: string, { boardId, repoId }: ReadinessSeed): void {
  const project = projectName.replace(/'/g, "''");
  runSql(`
    INSERT INTO boards (id) VALUES ('${boardId}');
    INSERT INTO board_issues (board_id, issue_id) VALUES ('${boardId}', '${boardId}-issue');
    INSERT INTO repos (id) VALUES ('${repoId}');
    INSERT INTO pull_requests (id, base_repo_id) VALUES ('${repoId}-pr', '${repoId}');
    INSERT INTO project_mapping (project_name, \`table\`, row_id) VALUES ('${project}', 'boards', '${boardId}'), ('${project}', 'repos', '${repoId}');
  `);
}

// One OTel activity row for a connection, which counts as AI data for every project that connection is placed under.
export function seedOtelActivity(token: string, connectionId: number): void {
  runSql(
    `INSERT INTO ai_activities (id, provider, source_type, source_connection_id) VALUES ('${token}-ai', 'claude', 'otel', ${connectionId});`,
  );
}

// Removes every row seeded for the token, whether or not the test that created it passed.
export function deleteReadinessSeed(token: string): void {
  const like = `%${token}%`;
  runSql(`
    DELETE FROM project_mapping WHERE row_id LIKE '${like}';
    DELETE FROM board_issues WHERE board_id LIKE '${like}';
    DELETE FROM boards WHERE id LIKE '${like}';
    DELETE FROM pull_requests WHERE id LIKE '${like}';
    DELETE FROM repos WHERE id LIKE '${like}';
    DELETE FROM ai_activities WHERE id LIKE '${like}';
  `);
}
