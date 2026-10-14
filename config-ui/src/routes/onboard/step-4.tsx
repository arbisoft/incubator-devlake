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

import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { Progress, Button } from 'antd';
import { useState, useContext, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'styled-components';

import API from '@/api';
import { LINKS, PATHS } from '@/config';
import { useAutoRefresh } from '@/hooks';
import { ExternalLink, STATUS_TONE } from '@/ui';
import { operator } from '@/utils';

import { Logs } from './components';
import { FINAL_TASK_STATUSES, ONBOARD_DONE_STEP, ONBOARD_STATUS, STORE_KEY } from './components/constants';
import { getOnboardStatus } from './components/utils';
import { COPY, DASHBOARD_WINDOW_FEATURES, DASHBOARD_WINDOW_TARGET, ONBOARD_PLUGIN, WIZARD_STEP } from './constants';
import { Context } from './context';
import { DASHBOARD_URL } from './dashboard-url';
import { toOnboardCollectionErrorMessage, triggerOnboardPipeline } from './pipeline';
import * as S from './styled';
import { getCompletionPercent, toSyncLog } from './utils';

export const Step4 = () => {
  const [operating, setOperating] = useState(false);
  const pending = useRef(false);

  const navigate = useNavigate();
  const { layout } = useTheme();

  const { step, records, done, projectName, plugin, setRecords } = useContext(Context);

  const record = useMemo(() => records.find((it) => it.plugin === plugin), [plugin, records]);

  const { data } = useAutoRefresh(
    async (signal) => {
      if (!record?.pipelineId) {
        return;
      }
      return await API.pipeline.subTasks(record.pipelineId, signal);
    },
    [record],
    {
      cancel: (data) => !!data && FINAL_TASK_STATUSES.includes(data.status),
    },
  );

  const status = getOnboardStatus(ONBOARD_DONE_STEP, data?.status);
  const percent = getCompletionPercent(data?.completionRate);
  const collector = useMemo(() => toSyncLog(data?.subtasks?.[0], COPY.result.collectNonGit), [data]);
  const extractor = useMemo(() => toSyncLog(data?.subtasks?.[1], COPY.result.collectGit), [data]);

  const handleFinish = async () => {
    if (pending.current || operating) {
      return;
    }

    const [success] = await operator(
      () =>
        API.store.set(STORE_KEY, {
          step,
          records,
          done: true,
          projectName,
          plugin,
        }),
      {
        setOperating,
      },
    );

    if (success) {
      navigate(PATHS.ROOT());
    }
  };

  const handleRecollectData = async () => {
    if (!record || pending.current) {
      return;
    }

    pending.current = true;

    try {
      await operator(
        async () => {
          const pipelineId = await triggerOnboardPipeline(record.blueprintId);

          const newRecords = records.map((it) =>
            it.plugin !== plugin
              ? it
              : {
                  ...it,
                  pipelineId,
                },
          );

          await API.store.set(STORE_KEY, {
            step: WIZARD_STEP.RESULT,
            records: newRecords,
            done,
            projectName,
            plugin,
          });

          setRecords(newRecords);
        },
        {
          setOperating,
          formatReason: toOnboardCollectionErrorMessage,
        },
      );
    } finally {
      pending.current = false;
    }
  };

  if (!plugin || !record) {
    return null;
  }

  const { scopeName } = record;
  const syncTip = plugin === ONBOARD_PLUGIN.GITHUB ? COPY.result.syncTip[plugin] : COPY.result.syncTip.other;
  const openDashboard = () => window.open(DASHBOARD_URL[plugin], DASHBOARD_WINDOW_TARGET, DASHBOARD_WINDOW_FEATURES);
  const recollectAction = (
    <Button type="primary" disabled={operating} loading={operating} onClick={handleRecollectData}>
      {COPY.result.recollect}
    </Button>
  );

  return (
    <S.Result>
      {status === ONBOARD_STATUS.RUNNING && (
        <S.ResultTop>
          <S.ResultInfo>{COPY.result.syncing(scopeName)}</S.ResultInfo>
          <S.ResultTip>{syncTip}</S.ResultTip>
          <Progress type="circle" size={layout.wizardResultSize} percent={percent} />
        </S.ResultTop>
      )}
      {status === ONBOARD_STATUS.SUCCESS && (
        <S.ResultTop>
          <S.ResultInfo>{COPY.result.collected(scopeName)}</S.ResultInfo>
          <S.ResultIcon $tone={STATUS_TONE.SUCCESS}>
            <CheckCircleOutlined />
          </S.ResultIcon>
          <S.ResultActions $column>
            <Button type="primary" onClick={openDashboard}>
              {COPY.result.dashboard}
            </Button>
            <Button disabled={operating} loading={operating} onClick={handleFinish}>
              {COPY.result.finish}
            </Button>
          </S.ResultActions>
        </S.ResultTop>
      )}
      {status === ONBOARD_STATUS.PARTIAL && (
        <S.ResultTop>
          <S.ResultInfo>{COPY.result.partial(scopeName)}</S.ResultInfo>
          <S.ResultIcon $tone={STATUS_TONE.WARNING}>
            <CheckCircleOutlined />
          </S.ResultIcon>
          <S.ResultActions>
            {recollectAction}
            <Button type="primary" onClick={openDashboard}>
              {COPY.result.dashboard}
            </Button>
          </S.ResultActions>
        </S.ResultTop>
      )}
      {status === ONBOARD_STATUS.FAILED && (
        <S.ResultTop>
          <S.ResultInfo>{COPY.result.failed}</S.ResultInfo>
          <S.ResultTip>
            {COPY.result.failedHint} <ExternalLink href={LINKS.GITHUB_NEW_ISSUE}>{COPY.result.github}</ExternalLink>.
          </S.ResultTip>
          <S.ResultIcon $tone={STATUS_TONE.ERROR}>
            <CloseCircleOutlined />
          </S.ResultIcon>
          <S.ResultActions>{recollectAction}</S.ResultActions>
        </S.ResultTop>
      )}
      <S.LogsTitle>{COPY.result.progress}</S.LogsTitle>
      <S.LogsDetail>
        <Logs log={collector} />
        <Logs log={extractor} />
      </S.LogsDetail>
    </S.Result>
  );
};
