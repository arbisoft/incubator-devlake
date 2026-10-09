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

import type { IPluginConfig } from '@/types';
import { STORAGE_KEYS } from '@/ui/constants';

export type DismissedNotices = Record<string, string | undefined>;

export const deprecationStorageKey = (plugin: string) => `${STORAGE_KEYS.PLUGIN_DEPRECATION_DISMISSED}.${plugin}`;

export const pickDeprecatedPlugin = (
  configs: Array<IPluginConfig | undefined>,
  connections: Array<{ plugin: string }>,
  dismissed: DismissedNotices,
) =>
  configs.find(
    (config) =>
      config?.isDeprecated &&
      config.deprecationMessage &&
      dismissed[config.plugin] !== config.deprecationMessage &&
      connections.some((connection) => connection.plugin === config.plugin),
  );

const readDismissedNotice = (plugin: string) => {
  try {
    return window.localStorage.getItem(deprecationStorageKey(plugin)) ?? undefined;
  } catch {
    return undefined;
  }
};

export const readDismissedNotices = (plugins: string[]): DismissedNotices =>
  Object.fromEntries(plugins.map((plugin) => [plugin, readDismissedNotice(plugin)]));

export const writeDismissedNotice = (plugin: string, message: string) => {
  try {
    window.localStorage.setItem(deprecationStorageKey(plugin), message);
  } catch {
    // storage may be blocked; the dismissal then lasts for the session only
  }
};
