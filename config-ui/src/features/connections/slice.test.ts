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

import { IConnectionStatus, type IConnection } from '@/types';

import { HEALTH_FAILURE_REASON } from './constants';
import { checkConnectionHealth, connectionsSlice, removeConnection, testConnection, updateConnection } from './slice';
import type { ConnectionHealthEntry } from './types';

const NOW = 1_700_000_000_000;
const UNIQUE = 'github-1';
const REQUEST_ID = 'request';

const connection = { unique: UNIQUE, plugin: 'github', id: 1, status: IConnectionStatus.IDLE } as IConnection;
const online: ConnectionHealthEntry = { status: IConnectionStatus.ONLINE, testedAt: NOW };
const offline: ConnectionHealthEntry = {
  status: IConnectionStatus.OFFLINE,
  reason: HEALTH_FAILURE_REASON.CREDENTIALS,
  message: 'bad token',
  testedAt: NOW,
};

const initial = () => ({
  ...connectionsSlice.getInitialState(),
  connections: [connection],
});

const reduce = (state: ReturnType<typeof initial>, action: Parameters<typeof connectionsSlice.reducer>[1]) =>
  connectionsSlice.reducer(state, action);

describe('connections health state', () => {
  it('records a background probe without touching the connection status', () => {
    const next = reduce(
      initial(),
      checkConnectionHealth.fulfilled({ unique: UNIQUE, health: offline }, REQUEST_ID, connection),
    );
    expect(next.health[UNIQUE]).toEqual(offline);
    expect(next.connections[0].status).toBe(IConnectionStatus.IDLE);
  });

  it('records a user-initiated pass next to its status', () => {
    const next = reduce(
      initial(),
      testConnection.fulfilled(
        { unique: UNIQUE, status: IConnectionStatus.ONLINE, health: online },
        REQUEST_ID,
        connection,
      ),
    );
    expect(next.health[UNIQUE]).toEqual(online);
    expect(next.connections[0].status).toBe(IConnectionStatus.ONLINE);
  });

  it('records a user-initiated failure next to its status', () => {
    const next = reduce(
      initial(),
      testConnection.rejected(null, REQUEST_ID, connection, { unique: UNIQUE, health: offline }),
    );
    expect(next.health[UNIQUE]).toEqual(offline);
    expect(next.connections[0].status).toBe(IConnectionStatus.OFFLINE);
  });

  it('keeps working when a failure carries no health', () => {
    const next = reduce(initial(), testConnection.rejected(null, REQUEST_ID, connection));
    expect(next.health).toEqual({});
    expect(next.connections[0].status).toBe(IConnectionStatus.OFFLINE);
  });

  it('forgets the health of a removed connection', () => {
    const state = { ...initial(), health: { [UNIQUE]: online } };
    expect(
      reduce(state, removeConnection.fulfilled(UNIQUE, REQUEST_ID, { plugin: 'github', connectionId: 1 })).health,
    ).toEqual({});
  });

  it('forgets the health of an edited connection so it is tested again', () => {
    const state = { ...initial(), health: { [UNIQUE]: online } };
    const edited = { ...connection, name: 'renamed' };
    const next = reduce(state, updateConnection.fulfilled(edited, REQUEST_ID, { plugin: 'github', connectionId: 1 }));
    expect(next.health).toEqual({});
  });
});
