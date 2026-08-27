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
import axios from 'axios';
import { Alert, Button } from 'antd';
import { useNavigate } from 'react-router-dom';

import API from '@/api';
import type { OtelConnectionResponse } from '@/api/otel';
import { formatPlural } from '@/utils';
import { OTEL_ATTENTION_CHANGED_EVENT } from './constants';

const OTEL_PATH = `${import.meta.env.DEVLAKE_PATH_PREFIX ?? ''}/otel`;
const REFRESH_INTERVAL_MS = 30_000;
type OtelAttentionState = {
  connectionCount: number;
  restartRequired: number;
  recoveryRequired: number;
};

const getAttentionState = (connections: OtelConnectionResponse[]): OtelAttentionState =>
  connections.reduce(
    (state, connection) => ({
      connectionCount: state.connectionCount + (connection.restartRequired || connection.recoveryRequired ? 1 : 0),
      restartRequired: state.restartRequired + (connection.restartRequired ? 1 : 0),
      recoveryRequired: state.recoveryRequired + (connection.recoveryRequired ? 1 : 0),
    }),
    { connectionCount: 0, restartRequired: 0, recoveryRequired: 0 },
  );

const formatConnectionCount = (count: number) => formatPlural(count, 'connection');
const withVerb = (count: number, singular: string, plural: string) =>
  `${formatConnectionCount(count)} ${count === 1 ? singular : plural}`;

const isSameAttentionState = (left?: OtelAttentionState, right?: OtelAttentionState) =>
  left?.connectionCount === right?.connectionCount &&
  left?.restartRequired === right?.restartRequired &&
  left?.recoveryRequired === right?.recoveryRequired;

// Surface credential activation problems globally without changing DevLake's core pipeline UX.
export const OtelAttention = () => {
  const [attention, setAttention] = useState<OtelAttentionState>();
  const mounted = useRef(false);
  const abortController = useRef<AbortController>();
  const loggedRequestFailure = useRef(false);
  const navigate = useNavigate();
  const refresh = useCallback(async (force = false) => {
    if (!force && document.visibilityState === 'hidden') return;

    abortController.current?.abort();
    abortController.current = new AbortController();
    try {
      const connections = await API.otel.list(abortController.current.signal);
      loggedRequestFailure.current = false;
      const nextAttention = getAttentionState(connections);
      if (mounted.current) {
        setAttention((currentAttention) =>
          isSameAttentionState(currentAttention, nextAttention) ? currentAttention : nextAttention,
        );
      }
    } catch (error) {
      if (!axios.isCancel(error) && !loggedRequestFailure.current) {
        loggedRequestFailure.current = true;
        // Keep the global alert non-disruptive while leaving a browser diagnostic for support.
        console.warn('Unable to refresh Claude Code OTel attention state.', error);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh(true);
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    const handleAttentionChange = () => void refresh(true);
    window.addEventListener(OTEL_ATTENTION_CHANGED_EVENT, handleAttentionChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      mounted.current = false;
      abortController.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener(OTEL_ATTENTION_CHANGED_EVENT, handleAttentionChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refresh]);

  if (!attention || (!attention.restartRequired && !attention.recoveryRequired)) return null;

  const storageRecovery = attention.recoveryRequired > 0;
  const pendingRestart = attention.restartRequired > 0;
  const details = [
    storageRecovery &&
      withVerb(attention.recoveryRequired, 'needs credential storage recovery', 'need credential storage recovery'),
    pendingRestart &&
      withVerb(
        attention.restartRequired,
        'has credential changes waiting to be applied',
        'have credential changes waiting to be applied',
      ),
  ].filter(Boolean);
  const description = [
    `${withVerb(attention.connectionCount, 'needs attention', 'need attention')}: ${details.join('; ')}.`,
    storageRecovery && pendingRestart && 'A connection can appear in both categories.',
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
