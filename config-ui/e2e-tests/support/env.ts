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
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

function loadRootEnv(): void {
  let content: string;
  try {
    content = fs.readFileSync(path.join(REPO_ROOT, '.env'), 'utf-8');
  } catch {
    return;
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line
      .slice(0, eq)
      .trim()
      .replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if (/^(".*"|'.*')$/.test(value)) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadRootEnv();

const trimSlash = (url: string) => url.replace(/\/+$/, '');

export const APP_URL = trimSlash(process.env.E2E_BASE_URL ?? 'http://localhost:4000');
export const API_URL = trimSlash(process.env.E2E_API_URL ?? 'http://localhost:8080');
export const GRAFANA_URL = trimSlash(process.env.E2E_GRAFANA_URL ?? 'http://localhost:3002');
export const PROMETHEUS_URL = trimSlash(process.env.E2E_PROMETHEUS_URL ?? 'http://localhost:9090');
export const COLLECTOR_URL = trimSlash(process.env.E2E_COLLECTOR_URL ?? 'http://localhost:8889');
export const OTLP_HTTP_URL = trimSlash(process.env.E2E_OTLP_HTTP_URL ?? 'http://localhost:4318');

export const E2E_USER_PREFIX = 'e2e_';

export function requireEnv(...names: string[]): Record<string, string> {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables for the e2e suite: ${missing.join(', ')}`);
  }
  return Object.fromEntries(names.map((name) => [name, process.env[name] as string]));
}

export { REPO_ROOT };
