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
import { format } from 'node:util';

import { act, fireEvent } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pluginConfigs } from '@/plugins/register';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

const { requests } = vi.hoisted(() => ({ requests: [] as string[] }));

vi.mock('@/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils')>()),
  request: vi.fn((path: string) => {
    requests.push(path);
    return Promise.resolve([]);
  }),
}));

const { Form } = await import('@/plugins/components/connection-form/fields');
const { renderTransformation } = await import('@/plugins/components/scope-config-form/transformations');

type PluginConfig = (typeof pluginConfigs)[number];
type Values = Record<string, unknown>;
type Control = { tag: string; type?: string; role?: string; placeholder?: string };
type Screen = { mounted: Values; controls: Control[]; text: string; typed: Values };

const CONTROL_SELECTOR = 'input, textarea, [role="switch"], [role="combobox"], [role="radio"], [role="checkbox"]';
const TEXT_INPUT_TYPES = [null, 'text', 'password', 'url', 'number'];

const SETTLE_MS = 60;

// React reports these once per component per module, so they are asserted absent instead of recorded
const isReactKeyWarning = (message: string) =>
  message.startsWith('A props object containing a "key" prop') || message.includes('unique "key" prop');

const formatMessage = (args: unknown[]) =>
  format(...args)
    .split('\n\n')[0]
    .split('\n')
    .filter((line) => !/^\s+at /.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

const flush = async () => {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {});
  }
  // useRefreshData debounces requests by a real 10ms timer, so wait past it
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  });
  await act(async () => {});
};

const ConnectionHost = ({ config, onValues }: { config: PluginConfig; onValues: (values: Values) => void }) => {
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Values>({});

  useEffect(() => onValues(values), [values, onValues]);

  return (
    <Form
      type="create"
      name={config.name}
      fields={config.connection.fields}
      initialValues={config.connection.initialValues ?? {}}
      values={values}
      errors={errors}
      setValues={setValues}
      setErrors={setErrors}
    />
  );
};

const TransformationHost = ({ config, onValues }: { config: PluginConfig; onValues: (values: Values) => void }) => {
  const [transformation, setTransformation] = useState<Values>(config.scopeConfig?.transformation ?? {});

  useEffect(() => onValues(transformation), [transformation, onValues]);

  return renderTransformation(config.plugin, {
    entities: config.scopeConfig?.entities ?? [],
    connectionId: 1,
    scopeId: 'e2e-scope',
    scopeConfigId: 1,
    transformation,
    setTransformation,
    setHasError: () => undefined,
  });
};

const describeControls = (container: HTMLElement): Control[] =>
  Array.from(container.querySelectorAll(CONTROL_SELECTOR)).map((el) => {
    const control: Control = { tag: el.tagName.toLowerCase() };
    const type = el.getAttribute('type');
    const role = el.getAttribute('role');
    const placeholder = el.getAttribute('placeholder');
    if (type) control.type = type;
    if (role) control.role = role;
    if (placeholder) control.placeholder = placeholder;
    return control;
  });

const isTextLike = (el: Element) =>
  el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TEXT_INPUT_TYPES.includes(el.getAttribute('type')));

const isEditable = (el: Element) => !(el as HTMLInputElement).disabled && !(el as HTMLInputElement).readOnly;

const captureScreen = async (element: JSX.Element, read: () => Values): Promise<Screen> => {
  const { container, unmount } = renderWithTheme(element);
  await flush();
  const mounted = structuredClone(read());
  const controls = describeControls(container);
  const text = (container.textContent ?? '').replace(/\s+/g, ' ').trim();
  Array.from(container.querySelectorAll('input, textarea'))
    .filter((el) => isTextLike(el) && isEditable(el))
    .forEach((el, i) => fireEvent.change(el, { target: { value: `v${i}` } }));
  await flush();
  const typed = structuredClone(read());
  unmount();
  return { mounted, controls, text, typed };
};

describe('plugin matrix', () => {
  const collected: string[] = [];
  const spies: { mockRestore: () => void }[] = [];

  beforeEach(() => {
    requests.length = 0;
    collected.length = 0;
    const collect = (...args: unknown[]) => {
      collected.push(formatMessage(args));
    };
    spies.push(vi.spyOn(console, 'error').mockImplementation(collect));
    spies.push(vi.spyOn(console, 'warn').mockImplementation(collect));
  });

  afterEach(() => {
    spies.splice(0).forEach((spy) => spy.mockRestore());
  });

  it.each(pluginConfigs.map((config) => [config.plugin, config] as const))(
    '%s keeps its connection and scope-config behaviour',
    async (plugin, config) => {
      let current: Values = {};
      const read = () => current;
      const onValues = (values: Values) => {
        current = values;
      };

      const connection = await captureScreen(<ConnectionHost config={config} onValues={onValues} />, read);
      current = {};
      const scopeConfig = config.scopeConfig
        ? await captureScreen(<TransformationHost config={config} onValues={onValues} />, read)
        : null;

      expect(collected.filter(isReactKeyWarning)).toEqual([]);

      const record = {
        plugin,
        connection,
        scopeConfig,
        consoleErrors: Array.from(new Set(collected.filter((message) => !isReactKeyWarning(message)))).sort(),
        requests: Array.from(new Set(requests)).sort(),
      };

      await expect(JSON.stringify(record, null, 2) + '\n').toMatchFileSnapshot(`./plugin-matrix/${plugin}.json`);
    },
  );

  it('has a golden for every registered plugin, and none for unknown ones', () => {
    const goldens = Object.keys(import.meta.glob('./plugin-matrix/*.json'))
      .map((path) => path.replace('./plugin-matrix/', '').replace('.json', ''))
      .sort();

    expect(goldens).toEqual(pluginConfigs.map((config) => config.plugin).sort());
  });
});
