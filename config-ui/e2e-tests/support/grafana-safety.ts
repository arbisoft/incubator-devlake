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
import { isIP } from 'node:net';

const E2E_EMAIL_PATTERN = /^e2e-[a-z0-9][a-z0-9._+-]*@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i;
const E2E_PROJECT_PATTERN = /^e2e-[a-z0-9][a-z0-9._-]*$/i;

export function assertLoopbackTarget(target: string): void {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new Error('Refusing a non-loopback test target.');
  }
  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  const isLoopbackIp = isIP(hostname) === 4 && Number(hostname.split('.')[0]) === 127 ? true : hostname === '::1';
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    (!isLoopbackIp && hostname !== 'localhost') ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('Refusing a non-loopback test target.');
  }
}

export function assertE2eEmail(email: string): void {
  if (!E2E_EMAIL_PATTERN.test(email)) {
    throw new Error('Grafana test accounts must use an e2e- email address.');
  }
}

export function assertE2eProjectName(name: string): void {
  if (!E2E_PROJECT_PATTERN.test(name)) {
    throw new Error('Grafana test projects must use an e2e- name.');
  }
}
