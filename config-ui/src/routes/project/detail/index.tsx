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

import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

import { Helmet } from 'react-helmet';
import { Tabs, message } from 'antd';

import API from '@/api';
import { PageHeader, PageLoading } from '@/components';
import { PATHS } from '@/config';
import { useRefreshData } from '@/hooks';
import { BlueprintDetail, FromEnum } from '@/routes';

import { WebhooksPanel } from './webhooks-panel';
import { SettingsPanel } from './settings-panel';
import { ClaudeCodeOtelPanel } from './claude-code-otel-panel';
import * as S from './styled';

const brandName = import.meta.env.DEVLAKE_BRAND_NAME ?? 'DevLake';

export const ProjectDetailPage = () => {
  const [version, setVersion] = useState(1);
  const [tabId, setTabId] = useState('blueprint');

  const { pname } = useParams() as { pname: string };
  const { state } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setTabId(state?.tabId ?? 'blueprint');
  }, [state]);

  const { ready, data, error } = useRefreshData(() => API.project.get(pname), [pname, version]);

  // Keep the loaded project on screen during refreshes so open panels and dialogs are not unmounted.
  const lastLoaded = useRef<{ pname: string; project: NonNullable<typeof data> } | null>(null);
  if (data) {
    lastLoaded.current = { pname, project: data };
  }
  const project = data ?? (!error && lastLoaded.current?.pname === pname ? lastLoaded.current.project : undefined);

  useEffect(() => {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      message.error(`Project not found with project name: ${pname}`);
      setTimeout(() => {
        navigate(PATHS.PROJECTS(), { replace: true });
      }, 100);
    }
  }, [error, navigate, pname]);

  const handleChangeTabId = (tabId: string) => {
    setTabId(tabId);
  };

  const handleRefresh = () => {
    setVersion((v) => v + 1);
  };

  if (!project) {
    return !ready && !error ? <PageLoading /> : null;
  }

  return (
    <PageHeader
      breadcrumbs={[
        { name: 'Projects', path: PATHS.PROJECTS() },
        { name: project.name, path: PATHS.PROJECT(pname) },
      ]}
    >
      <Helmet>
        <title>
          {project.name} - {brandName}
        </title>
      </Helmet>
      <S.Wrapper>
        <Tabs
          items={[
            {
              key: 'blueprint',
              label: 'Blueprint',
              children: <BlueprintDetail id={project.blueprint.id} from={FromEnum.project} />,
            },
            {
              key: 'webhook',
              label: 'Webhooks',
              children: <WebhooksPanel project={project} onRefresh={handleRefresh} />,
            },
            {
              key: 'claude-code-otel',
              label: 'Claude Code OTel',
              children: <ClaudeCodeOtelPanel projectName={project.name} />,
            },
            {
              key: 'settings',
              label: 'Settings',
              children: <SettingsPanel project={project} onRefresh={handleRefresh} />,
            },
          ]}
          activeKey={tabId}
          onChange={handleChangeTabId}
        />
      </S.Wrapper>
    </PageHeader>
  );
};
