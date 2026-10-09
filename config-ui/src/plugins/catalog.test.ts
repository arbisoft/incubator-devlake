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
import { describe, expect, it } from 'vitest';

import { DEFAULT_CATALOG_ENTRY, INTEGRATION_CATEGORY, PLUGIN_CATALOG, getCatalogEntry } from './catalog';
import { pluginConfigs } from './register';

const CATEGORIES: string[] = Object.values(INTEGRATION_CATEGORY);

describe('plugin catalog', () => {
  it.each(pluginConfigs.map((config) => config.plugin))('has an entry for the registered plugin %s', (plugin) => {
    expect(PLUGIN_CATALOG[plugin]).toBeDefined();
  });

  it('has no entry for a plugin that is not registered', () => {
    const registered = new Set(pluginConfigs.map((config) => config.plugin));
    expect(Object.keys(PLUGIN_CATALOG).filter((plugin) => !registered.has(plugin))).toEqual([]);
  });

  it('only uses known categories and unique weights', () => {
    const entries = Object.values(PLUGIN_CATALOG);
    expect(entries.every((entry) => CATEGORIES.includes(entry.category))).toBe(true);
    expect(new Set(entries.map((entry) => entry.weight)).size).toBe(entries.length);
  });

  it('falls back to a safe default for an unknown plugin', () => {
    expect(getCatalogEntry({ plugin: 'not-a-plugin' })).toEqual({ ...DEFAULT_CATALOG_ENTRY, beta: false });
  });

  it('takes beta from the plugin config unless the entry sets it', () => {
    expect(getCatalogEntry({ plugin: 'github', isBeta: true }).beta).toBe(true);
    expect(getCatalogEntry({ plugin: 'github' }).beta).toBe(false);
  });
});
