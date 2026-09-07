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
import { PATHS } from '@/config';
import { OTEL_ATTENTION_CHANGED_EVENT, OTEL_REFRESH_INTERVAL_MS, OTEL_VISIBILITY_THROTTLE_MS } from './constants';
import { getAttentionDescription, getAttentionState, isSameAttentionState, type OtelAttentionState } from './utils';

// Surface credential activation problems globally without changing DevLake's core pipeline UX.
export const OtelAttention = () => {
  const [attention, setAttention] = useState<OtelAttentionState>();
  const mounted = useRef(false);
  const abortController = useRef<AbortController>();
  const lastRefreshedAt = useRef(0);
  const navigate = useNavigate();

  const refresh = useCallback(async (force = false) => {
    if (!force && document.visibilityState === 'hidden') return;

    abortController.current?.abort();
    abortController.current = new AbortController();
    try {
      const connections = await API.otel.list(abortController.current.signal);
      lastRefreshedAt.current = Date.now();
      const nextAttention = getAttentionState(connections);
      if (mounted.current) {
        setAttention((currentAttention) =>
          isSameAttentionState(currentAttention, nextAttention) ? currentAttention : nextAttention,
        );
      }
    } catch {
      // Silent failure for background polling banner; avoid intrusive UI/console noise.
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh(true);
    const timer = window.setInterval(() => void refresh(), OTEL_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastRefreshedAt.current >= OTEL_VISIBILITY_THROTTLE_MS) {
          void refresh(true);
        }
      }
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
  const description = getAttentionDescription(attention);

  return (
    <div role="region" aria-live="polite" aria-label="Claude Code telemetry attention">
      <Alert
        banner
        showIcon
        type={storageRecovery ? 'error' : 'warning'}
        message="Claude Code telemetry needs attention."
        description={description}
        action={
          <Button type="link" onClick={() => navigate(PATHS.OTEL())}>
            Manage Claude Code OTel
          </Button>
        }
        style={{ marginBottom: 24 }}
      />
    </div>
  );
};
