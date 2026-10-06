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

import { Tabs, message } from 'antd';
import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useParams, useNavigate } from 'react-router-dom';

import API from '@/api';
import { PageHeader, PageLoading } from '@/components';
import { BRAND_NAME, PATHS, PROJECT_TAB } from '@/config';
import { useRefreshData } from '@/hooks';
import { BlueprintDetail, FromEnum } from '@/routes';
import { useRouteTab } from '@/ui/hooks';

import { ClaudeCodeOtelPanel } from './claude-code-otel-panel';
import { COPY } from './constants';
import { SettingsPanel } from './settings-panel';
import * as S from './styled';
import { getProjectTabs } from './utils';
import { WebhooksPanel } from './webhooks-panel';

export const ProjectDetailPage = () => {
  const [version, setVersion] = useState(1);

  const { pname } = useParams() as { pname: string };
  const navigate = useNavigate();

  const tabs = useMemo(() => getProjectTabs(pname), [pname]);
  const activeTab = useRouteTab(tabs);

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

  const handleChangeTab = (key: string) => {
    const target = tabs.find((tab) => tab.key === key);
    if (target) navigate(target.path);
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
        { name: project.name, path: PATHS.PROJECT_TAB(pname, PROJECT_TAB.BLUEPRINT) },
      ]}
    >
      <Helmet>
        <title>
          {project.name} - {BRAND_NAME}
        </title>
      </Helmet>
      <S.Wrapper>
        <Tabs
          items={[
            {
              key: PROJECT_TAB.BLUEPRINT,
              label: COPY.tabs[PROJECT_TAB.BLUEPRINT],
              children: <BlueprintDetail id={project.blueprint.id} from={FromEnum.project} />,
            },
            {
              key: PROJECT_TAB.WEBHOOKS,
              label: COPY.tabs[PROJECT_TAB.WEBHOOKS],
              children: <WebhooksPanel project={project} onRefresh={handleRefresh} />,
            },
            {
              key: PROJECT_TAB.CLAUDE_CODE_OTEL,
              label: COPY.tabs[PROJECT_TAB.CLAUDE_CODE_OTEL],
              children: <ClaudeCodeOtelPanel projectName={project.name} />,
            },
            {
              key: PROJECT_TAB.SETTINGS,
              label: COPY.tabs[PROJECT_TAB.SETTINGS],
              children: <SettingsPanel project={project} onRefresh={handleRefresh} />,
            },
          ]}
          activeKey={activeTab}
          onChange={handleChangeTab}
        />
      </S.Wrapper>
    </PageHeader>
  );
};
