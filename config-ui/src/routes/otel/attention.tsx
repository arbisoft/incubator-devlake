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

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button } from 'antd';
import { useNavigate } from 'react-router-dom';

import API from '@/api';
import type { OtelConnectionResponse } from '@/api/otel';

const OTEL_PATH = `${import.meta.env.DEVLAKE_PATH_PREFIX ?? ''}/otel`;
const REFRESH_INTERVAL_MS = 30_000;
export const OTEL_ATTENTION_CHANGED_EVENT = 'devlake:otel-attention-changed';

type OtelAttentionState = {
  restartRequired: number;
  recoveryRequired: number;
};

const getAttentionState = (connections: OtelConnectionResponse[]): OtelAttentionState =>
  connections.reduce(
    (state, connection) => ({
      restartRequired: state.restartRequired + Number(connection.restartRequired),
      recoveryRequired: state.recoveryRequired + Number(connection.recoveryRequired),
    }),
    { restartRequired: 0, recoveryRequired: 0 },
  );

export const notifyOtelAttentionChanged = () => {
  window.dispatchEvent(new Event(OTEL_ATTENTION_CHANGED_EVENT));
};

const formatConnectionCount = (count: number) => `${count} connection${count === 1 ? '' : 's'}`;

// Surface credential activation problems globally without changing DevLake's core pipeline UX.
export const OtelAttention = () => {
  const [attention, setAttention] = useState<OtelAttentionState>();
  const mounted = useRef(false);
  const navigate = useNavigate();
  const refresh = useCallback(async () => {
    try {
      const connections = await API.otel.list();
      if (mounted.current) setAttention(getAttentionState(connections));
    } catch {
      // Do not interrupt normal navigation when the custom plugin is temporarily unavailable.
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    window.addEventListener(OTEL_ATTENTION_CHANGED_EVENT, refresh);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.removeEventListener(OTEL_ATTENTION_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  if (!attention || (!attention.restartRequired && !attention.recoveryRequired)) return null;

  const storageRecovery = attention.recoveryRequired > 0;
  const pendingRestart = attention.restartRequired > 0;
  const details = [
    storageRecovery && `${formatConnectionCount(attention.recoveryRequired)} need credential storage recovery`,
    pendingRestart && `${formatConnectionCount(attention.restartRequired)} have credential changes waiting to be applied`,
  ].filter(Boolean);
  const description = [
    `${details.join('. ')}.`,
    storageRecovery && 'Revoke affected connections and generate new Claude settings to restore telemetry.',
    pendingRestart && 'Open Claude Code OTel to apply pending credential changes.',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Alert
      banner
      showIcon
      type={storageRecovery ? 'error' : 'warning'}
      message="Claude Code telemetry needs attention."
      description={description}
      action={
        <Button type="link" onClick={() => navigate(OTEL_PATH)}>
          Manage Claude Code OTel
        </Button>
      }
      style={{ marginBottom: 24 }}
    />
  );
};
