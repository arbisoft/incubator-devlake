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

import { createSlice, createAsyncThunk, type SerializedError } from '@reduxjs/toolkit';

import API from '@/api';
import { RootState } from '@/app/store';
import { IConnection, IConnectionAPI, IConnectionStatus, IWebhook, IStatus } from '@/types';

import { WEBHOOK_PLUGIN } from './constants';
import { healthFromTestError, healthFromTestResult, readStoredHealth } from './health';
import type { ConnectionHealthEntry, ConnectionHealthMap } from './types';
import { getErrorResponse, transformConnection, transformWebhook } from './utils';

const initialState: {
  status: IStatus;
  error: SerializedError | null;
  plugins: string[];
  connections: IConnection[];
  webhooks: IWebhook[];
  health: ConnectionHealthMap;
} = {
  status: 'idle',
  error: null,
  plugins: [],
  connections: [],
  webhooks: [],
  health: readStoredHealth(),
};

export const init = createAsyncThunk('connections/init', async (plugins: string[]) => {
  const connections = await Promise.all(
    plugins
      .filter((plugin) => plugin !== WEBHOOK_PLUGIN)
      .map(async (plugin) => {
        const connections = await API.connection.list(plugin);
        return connections.map((connection) => transformConnection(plugin, connection));
      }),
  );

  const webhooks = await Promise.all(
    plugins
      .filter((plugin) => plugin === WEBHOOK_PLUGIN)
      .map(async () => {
        const webhooks = await API.plugin.webhook.list();
        return webhooks.map((webhook) => transformWebhook(webhook));
      }),
  );

  return {
    plugins,
    connections: connections.flat(),
    webhooks: webhooks.flat(),
  };
});

type ConnectionPayload = Omit<IConnectionAPI, 'id'>;

export const addConnection = createAsyncThunk(
  'connections/addConnection',
  async ({ plugin, ...payload }: ConnectionPayload & { plugin: string }) => {
    const connection = await API.connection.create(plugin, payload);
    return transformConnection(plugin, connection);
  },
);

export const updateConnection = createAsyncThunk(
  'connections/updateConnection',
  async ({ plugin, connectionId, ...payload }: ConnectionPayload & { plugin: string; connectionId: ID }) => {
    const connection = await API.connection.update(plugin, connectionId, payload);
    return transformConnection(plugin, connection);
  },
);

export const removeConnection = createAsyncThunk(
  'connections/removeConnection',
  async ({ plugin, connectionId }: { plugin: string; connectionId: ID }, { rejectWithValue }) => {
    try {
      await API.connection.remove(plugin, connectionId);
      return `${plugin}-${connectionId}`;
    } catch (err: unknown) {
      const response = getErrorResponse(err);
      if (!response) throw err;
      return rejectWithValue({ ...response.data, status: response.status });
    }
  },
);

export const testConnection = createAsyncThunk(
  'connections/testConnection',
  async ({ plugin, id, unique }: IConnection, { rejectWithValue }) => {
    try {
      const res = await API.connection.test(plugin, id);

      return {
        unique,
        status: res.success ? IConnectionStatus.ONLINE : IConnectionStatus.OFFLINE,
        health: healthFromTestResult(res, Date.now()),
      };
    } catch (err: unknown) {
      return rejectWithValue({ unique, response: getErrorResponse(err), health: healthFromTestError(err, Date.now()) });
    }
  },
);

// Background probe: records health only and leaves `status` to the user-initiated test above.
export const checkConnectionHealth = createAsyncThunk(
  'connections/checkConnectionHealth',
  async ({ plugin, id, unique }: IConnection) => {
    try {
      const res = await API.connection.test(plugin, id);
      return { unique, health: healthFromTestResult(res, Date.now()) };
    } catch (err: unknown) {
      return { unique, health: healthFromTestError(err, Date.now()) };
    }
  },
);

export const addWebhook = createAsyncThunk('connections/addWebhook', async (payload: { name: string }) => {
  const webhook = await API.plugin.webhook.create(payload);
  return {
    webhook: transformWebhook(webhook),
    apiKey: webhook.apiKey.apiKey,
  };
});

export const removeWebhook = createAsyncThunk('connections/removeWebhook', async (id: ID) => {
  await API.plugin.webhook.remove(id);
  return id;
});

export const updateWebhook = createAsyncThunk(
  'connections/updateWebhook',
  async ({ id, ...payload }: { id: ID; name: string }) => {
    const webhook = await API.plugin.webhook.update(id, payload);
    return webhook;
  },
);

export const renewWebhookApiKey = createAsyncThunk('connections/renewWebhookApiKey', async (id: ID, { getState }) => {
  const webhook = (getState() as RootState).connections.webhooks.find((wh) => wh.id === id) as IWebhook;
  const apiKey = await API.apiKey.renew(webhook.apiKeyId);
  return {
    id: webhook.id,
    apiKey: apiKey.apiKey,
  };
});

export const connectionsSlice = createSlice({
  name: 'connections',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(init.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(init.fulfilled, (state, action) => {
        state.plugins = action.payload.plugins;
        state.connections = action.payload.connections;
        state.webhooks = action.payload.webhooks;
        state.status = 'success';
      })
      .addCase(init.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error;
      })
      .addCase(addConnection.fulfilled, (state, action) => {
        state.connections.push(action.payload);
      })
      .addCase(updateConnection.fulfilled, (state, action) => {
        state.connections = state.connections.map((cs) => {
          if (cs.unique === action.payload.unique) {
            return action.payload;
          }
          return cs;
        });
        delete state.health[action.payload.unique];
      })
      .addCase(removeConnection.fulfilled, (state, action) => {
        state.connections = state.connections.filter((cs) => cs.unique !== action.payload);
        delete state.health[action.payload];
      })
      .addCase(testConnection.pending, (state, action) => {
        const existingConnection = state.connections.find((cs) => cs.unique === action.meta.arg.unique);
        if (existingConnection) {
          existingConnection.status = IConnectionStatus.TESTING;
        }
      })
      .addCase(testConnection.fulfilled, (state, action) => {
        const existingConnection = state.connections.find((cs) => cs.unique === action.payload.unique);
        if (existingConnection) {
          existingConnection.status = action.payload.status;
        }
        state.health[action.payload.unique] = action.payload.health;
      })
      .addCase(testConnection.rejected, (state, action) => {
        const existingConnection = state.connections.find((cs) => cs.unique === action.meta.arg.unique);
        if (existingConnection) {
          existingConnection.status = IConnectionStatus.OFFLINE;
        }
        const payload = action.payload as { health?: ConnectionHealthEntry } | undefined;
        if (payload?.health) {
          state.health[action.meta.arg.unique] = payload.health;
        }
      })
      .addCase(checkConnectionHealth.fulfilled, (state, action) => {
        state.health[action.payload.unique] = action.payload.health;
      })
      .addCase(addWebhook.fulfilled, (state, action) => {
        state.webhooks.push(action.payload.webhook);
      })
      .addCase(removeWebhook.fulfilled, (state, action) => {
        state.webhooks = state.webhooks.filter((wh) => wh.id !== action.payload);
      })
      .addCase(updateWebhook.fulfilled, (state, action) => {
        state.webhooks = state.webhooks.map((wh) =>
          wh.id === action.payload.id ? { ...wh, name: action.payload.name } : wh,
        );
      });
  },
});

export const selectStatus = (state: RootState) => state.connections.status;

export const selectError = (state: RootState) => state.connections.error;

export const selectPlugins = (state: RootState) => state.connections.plugins;

export const selectAllConnections = (state: RootState) => state.connections.connections;

export const selectConnections = (state: RootState, plugin: string) =>
  state.connections.connections.filter((connection) => connection.plugin === plugin);

export const selectConnection = (state: RootState, unique: string) =>
  state.connections.connections.find((cs) => cs.unique === unique);

export const selectHealth = (state: RootState) => state.connections.health;

export const selectWebhooks = (state: RootState) => state.connections.webhooks;

export const selectWebhook = (state: RootState, id: ID) => state.connections.webhooks.find((wh) => wh.id === id);
