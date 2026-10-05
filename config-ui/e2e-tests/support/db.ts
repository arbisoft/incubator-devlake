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

export interface DbCredentials {
  user: string;
  password: string;
  database: string;
  host: string;
  port: string;
}

// Credentials come from E2E_DB_USER/PASSWORD/NAME, falling back to the app DB_URL (not E2E_DB_URL, which targets the Go test database).
export function dbCredentials(): DbCredentials {
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
    throw new Error(`SQL execution via docker container "${container}" failed: ${stderr || (err as Error).message}`);
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

export function countLocalCredentials(loginName: string): number {
  return Number(
    runSql(`SELECT COUNT(*) FROM auth_local_credentials WHERE login_name = '${loginName.replace(/'/g, "''")}';`).trim(),
  );
}

export function passwordHashFor(loginName: string): string {
  return runSql(
    `SELECT password_hash FROM auth_local_credentials WHERE login_name = '${loginName.replace(/'/g, "''")}';`,
  ).trim();
}
