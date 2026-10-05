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
import { BrowserContext } from '@playwright/test';
import { execFileSync } from 'child_process';
import path from 'path';

import { APP_URL, REPO_ROOT, requireEnv } from './support/env';
import { dbDsn } from './support/db';

const CSRF_TOKEN = 'e2e-csrf-token';

let cachedToken: string | undefined;

// Mints a session for the existing admin identity in E2E_ADMIN_* via backend/test/e2e/mintsession.
export function getAdminSessionToken(): string {
  if (cachedToken) {
    return cachedToken;
  }
  const admin = requireEnv(
    'SESSION_SECRET',
    'E2E_ADMIN_PROVIDER',
    'E2E_ADMIN_SUB',
    'E2E_ADMIN_EMAIL',
    'E2E_ADMIN_NAME',
  );
  try {
    cachedToken = execFileSync(process.env.E2E_GO_BIN ?? 'go', ['run', './test/e2e/mintsession'], {
      cwd: path.join(REPO_ROOT, 'backend'),
      encoding: 'utf-8',
      env: { ...process.env, ...admin, E2E_DB_DSN: dbDsn() },
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    const stderr = (err as { stderr?: Buffer | string }).stderr?.toString().trim();
    throw new Error(`Failed to mint an admin session: ${stderr || (err as Error).message}`, { cause: err });
  }
  return cachedToken;
}

export async function loginAsAdmin(context: BrowserContext, baseURL = APP_URL) {
  const token = getAdminSessionToken();
  const url = new URL(baseURL);
  await context.addCookies([
    {
      name: 'devlake_session',
      value: token,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
    {
      name: 'devlake_csrf',
      value: CSRF_TOKEN,
      domain: url.hostname,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
  return { token, csrfToken: CSRF_TOKEN };
}
