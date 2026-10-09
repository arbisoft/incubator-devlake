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

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import API from '@/api';
import { PATHS } from '@/config';
import { useRefreshData, useAutoRefresh } from '@/hooks';
import { ConfirmModal, CONFIRM_TONE, ProgressBanner } from '@/ui';
import { operator } from '@/utils';

import { DashboardURLMap } from '../step-4';

import { BANNER_ACTION, COPY, FINAL_TASK_STATUSES, STORE_KEY } from './constants';
import type { BannerAction, OnboardStore } from './types';
import { getBannerModel, getOnboardStatus } from './utils';

export const OnboardCard = () => {
  const [operating, setOperating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [version, setVersion] = useState(0);

  const navigate = useNavigate();

  const { ready, data } = useRefreshData<OnboardStore | null>(() => API.store.get(STORE_KEY), [version]);

  const record = useMemo(() => data?.records.find((it) => it.plugin === data.plugin), [data]);

  const tasksRes = useAutoRefresh(
    async () => {
      if (data?.done || !record?.pipelineId) {
        return;
      }

      return await API.pipeline.subTasks(record.pipelineId);
    },
    [record],
    {
      cancel: (tasks) => !!tasks && FINAL_TASK_STATUSES.includes(tasks.status),
    },
  );

  const handleClose = async () => {
    const [success] = await operator(() => API.store.set(STORE_KEY, { ...data, done: true }), { setOperating });
    setConfirmOpen(false);

    if (success) {
      setVersion(version + 1);
    }
  };

  if (!ready || !data || data.done) {
    return null;
  }

  const status = getOnboardStatus(data.step, tasksRes.data?.status);
  const model = getBannerModel(status, data.step);

  const handlers: Record<BannerAction, () => void> = {
    [BANNER_ACTION.CONTINUE]: () => navigate(PATHS.ONBOARD()),
    [BANNER_ACTION.DETAILS]: () => navigate(PATHS.ONBOARD()),
    [BANNER_ACTION.DASHBOARD]: () => window.open(DashboardURLMap[data.plugin]),
    [BANNER_ACTION.FINISH]: () => setConfirmOpen(true),
  };

  return (
    <>
      <ProgressBanner
        title={model.title}
        message={model.message}
        tone={model.tone}
        loading={model.loading}
        progress={model.progress}
        actionLabel={COPY.actions[model.primary]}
        onAction={handlers[model.primary]}
        secondaryAction={
          model.secondary && { label: COPY.actions[model.secondary], onClick: handlers[model.secondary] }
        }
        onDismiss={() => setConfirmOpen(true)}
      />
      <ConfirmModal
        open={confirmOpen}
        tone={CONFIRM_TONE.DEFAULT}
        title={COPY.confirm.title}
        description={COPY.confirm.description}
        confirmLabel={COPY.confirm.confirm}
        loading={operating}
        onConfirm={handleClose}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
};
