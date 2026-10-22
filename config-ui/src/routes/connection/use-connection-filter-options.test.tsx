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

import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import type { OtelConnectionResponse } from '@/api/otel';
import { connectionsSlice, WEBHOOK_PLUGIN } from '@/features/connections';

import { COPY, OTEL_INTEGRATION_KEY } from './constants';
import { useConnectionFilterOptions } from './use-connection-filter-options';

const OTEL = [{ connection: { id: 7, name: 'Team A' }, projects: [] }] as unknown as OtelConnectionResponse[];

const setup = (props: Parameters<typeof useConnectionFilterOptions>[0]) => {
  const store = configureStore({
    reducer: { connections: connectionsSlice.reducer },
    preloadedState: {
      connections: {
        ...connectionsSlice.getInitialState(),
        connections: [{ unique: 'github-1', plugin: 'github', pluginName: 'GitHub', id: 1, name: 'arbisoft/website' }],
        webhooks: [{ id: 3, name: 'deploys' }],
      },
    },
  } as never);
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(() => useConnectionFilterOptions(props), { wrapper }).result.current;
};

describe('useConnectionFilterOptions', () => {
  it('lists store connections and webhooks as plugin:id sorted by text', () => {
    const options = setup({ includeOtel: false, otelConnections: OTEL });
    expect(options.map(({ value }) => value)).toEqual(['github:1', `${WEBHOOK_PLUGIN}:3`]);
    expect(options[0].text).toBe('arbisoft/website (GitHub)');
    expect([...options].map(({ text }) => text)).toEqual(
      [...options.map(({ text }) => text)].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('adds OTel connections only when asked', () => {
    const options = setup({ includeOtel: true, otelConnections: OTEL });
    expect(options.find(({ value }) => value === `${OTEL_INTEGRATION_KEY}:7`)?.text).toBe(`Team A (${COPY.otelName})`);
  });
});
