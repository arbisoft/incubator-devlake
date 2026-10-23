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

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { TapdTransformation } from './transformation';
import type { TapdTransformationValues } from './types';

const storyCategories = vi.fn();
const statusMap = vi.fn();

vi.mock('@/api', () => ({
  default: {
    plugin: {
      tapd: {
        storyCategories: (...args: unknown[]) => storyCategories(...args),
        statusMap: (...args: unknown[]) => statusMap(...args),
      },
    },
  },
}));

vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useProxyPrefix: () => '/plugins/tapd/connections/1',
}));

const transformation: TapdTransformationValues = {
  typeMappings: { story: 'Requirement', BUG: 'BUG', epic: 'INCIDENT' },
  statusMappings: { planning: 'TODO', doing: 'IN-PROGRESS', closed: 'DONE' },
};

const renderTapd = (setTransformation = vi.fn()) => {
  renderWithTheme(
    <TapdTransformation
      entities={['TICKET']}
      connectionId={1}
      scopeId={7}
      transformation={transformation}
      setTransformation={setTransformation}
      setHasError={vi.fn()}
    />,
  );
  return setTransformation;
};

const selectOf = (label: string) => {
  const item = screen.getByText(label).closest('.ant-form-item') as HTMLElement;
  return {
    item,
    selected: () => Array.from(item.querySelectorAll('.ant-select-selection-item')).map((el) => el.textContent),
    combobox: within(item).getAllByRole('combobox')[0],
  };
};

describe('TapdTransformation', () => {
  beforeEach(() => {
    storyCategories.mockResolvedValue({
      data: [{ Category: { id: 'story', name: 'Story' } }, { Category: { id: 'epic', name: 'Epic' } }],
    });
    statusMap.mockResolvedValue({ data: { a: 'planning', b: 'doing', c: 'closed' } });
  });

  it('renders the six mapping rows with the saved selections', async () => {
    renderTapd();

    await screen.findByText('Requirement');
    for (const label of ['Requirement', 'Bug', 'Incident', 'TODO', 'IN-PROGRESS', 'DONE']) {
      expect(screen.getByText(label)).toBeDefined();
    }

    await waitFor(() => expect(selectOf('Requirement').selected()).toEqual(['Story']));
    expect(selectOf('Bug').selected()).toEqual(['bug']);
    expect(selectOf('Incident').selected()).toEqual(['Epic']);
    expect(selectOf('TODO').selected()).toEqual(['planning']);
    expect(selectOf('IN-PROGRESS').selected()).toEqual(['doing']);
    expect(selectOf('DONE').selected()).toEqual(['closed']);
  });

  const chooseBugOption = async (name: string) => {
    const setTransformation = renderTapd();

    await waitFor(() => expect(selectOf('Bug').selected()).toEqual(['bug']));
    fireEvent.mouseDown(selectOf('Bug').combobox);
    fireEvent.click(await screen.findByText(name, { selector: '.ant-select-item-option-content' }));
    return setTransformation;
  };

  it('lets the Incident group win when a Bug option is also mapped to Incident', async () => {
    const setTransformation = await chooseBugOption('Epic');

    expect(setTransformation).toHaveBeenLastCalledWith({
      ...transformation,
      typeMappings: { story: 'Requirement', BUG: 'BUG', epic: 'INCIDENT' },
    });
  });

  it('writes the chosen Bug option into typeMappings', async () => {
    const setTransformation = await chooseBugOption('task');

    expect(setTransformation).toHaveBeenLastCalledWith({
      ...transformation,
      typeMappings: { story: 'Requirement', BUG: 'BUG', TASK: 'BUG', epic: 'INCIDENT' },
    });
  });
});
