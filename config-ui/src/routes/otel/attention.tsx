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

import { Button } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import API from '@/api';
import { PATHS } from '@/config';

import { COPY, OTEL_ATTENTION_CHANGED_EVENT, OTEL_REFRESH_INTERVAL_MS, OTEL_VISIBILITY_THROTTLE_MS } from './constants';
import { AttentionAlert, AttentionRegion } from './styled';
import type { OtelAttentionState } from './types';
import { getAttentionDescription, getAttentionState, isSameAttentionState } from './utils';

export const OtelAttention = () => {
  const [attention, setAttention] = useState<OtelAttentionState>();
  const mounted = useRef(false);
  const abortController = useRef<AbortController | undefined>(undefined);
  const lastRefreshedAt = useRef(0);
  const navigate = useNavigate();

  const refresh = useCallback(async (force = false) => {
    if (!force && document.visibilityState === 'hidden') return;

    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    try {
      const connections = await API.otel.list(controller.signal);
      lastRefreshedAt.current = Date.now();
      const nextAttention = getAttentionState(connections);
      if (mounted.current && !controller.signal.aborted) {
        setAttention((currentAttention) =>
          isSameAttentionState(currentAttention, nextAttention) ? currentAttention : nextAttention,
        );
      }
    } catch {
      return;
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
    <AttentionRegion role="region" aria-live="polite" aria-label={COPY.attention.region}>
      <AttentionAlert
        showIcon
        type={storageRecovery ? 'error' : 'warning'}
        title={COPY.attention.title}
        description={description}
        action={
          <Button type="link" onClick={() => navigate(PATHS.OTEL())}>
            {COPY.attention.manage}
          </Button>
        }
      />
    </AttentionRegion>
  );
};
