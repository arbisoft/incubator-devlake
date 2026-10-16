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
import { assertE2eEmail, assertE2eProjectName } from './grafana-safety';

type CleanupAction = () => Promise<void>;

export function createGrafanaCleanupRegistry(actions: {
  revokeAdmin: (email: string) => Promise<void>;
  deleteUser: (email: string) => Promise<void>;
  clearOrphan: (account: string) => Promise<void>;
  deleteProject: (name: string) => Promise<void>;
}) {
  const pending = new Map<string, { order: number; run: CleanupAction }>();

  function register(key: string, order: number, run: CleanupAction): void {
    if (!pending.has(key)) {
      pending.set(key, { order, run });
    }
  }

  return {
    trackUser(email: string): void {
      assertE2eEmail(email);
      const key = email.toLowerCase();
      register(`user:${key}`, 1, () => actions.deleteUser(email));
      register(`orphan:${key}`, 2, () => actions.clearOrphan(email));
    },

    trackGrafanaAdmin(email: string): void {
      assertE2eEmail(email);
      register(`revoke:${email.toLowerCase()}`, 0, () => actions.revokeAdmin(email));
    },

    trackOrphan(account: string): void {
      assertE2eEmail(account);
      register(`orphan:${account.toLowerCase()}`, 2, () => actions.clearOrphan(account));
    },

    trackProject(name: string): void {
      assertE2eProjectName(name);
      register(`project:${name}`, 3, () => actions.deleteProject(name));
    },

    async cleanup(): Promise<void> {
      const tasks = [...pending.entries()].sort((left, right) => left[1].order - right[1].order);
      let failed = false;
      for (const [key, task] of tasks) {
        try {
          await task.run();
          pending.delete(key);
        } catch {
          failed = true;
        }
      }
      if (failed) {
        throw new Error('Grafana test cleanup did not remove every registered resource.');
      }
    },
  };
}
