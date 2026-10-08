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

import { message } from 'antd';
import axios from 'axios';
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import API from '@/api';
import { PageLoading } from '@/components';
import { PATHS, PROJECT_TAB } from '@/config';
import { useRefreshData } from '@/hooks';
import { BLUEPRINT_CONTEXT, BlueprintDetail, getProjectBlueprintViews, useBlueprintView } from '@/routes';
import {
  EmptyState,
  EMPTY_STATE_SIZE,
  ListPage,
  PageHeader,
  RouteTabs,
  ROUTE_TABS_VARIANT,
  useLastLoaded,
  useRefreshVersion,
} from '@/ui';
import { useRouteTab } from '@/ui/hooks';

import { ClaudeCodeOtelPanel } from './claude-code-otel-panel';
import { COPY } from './constants';
import { SettingsPanel } from './settings-panel';
import { getProjectTabs, toProjectTab } from './utils';
import { WebhooksPanel } from './webhooks-panel';

const NOT_FOUND_REDIRECT_DELAY_MS = 100;

export const ProjectDetailPage = () => {
  const { pname = '' } = useParams();
  const navigate = useNavigate();
  const { version, refresh } = useRefreshVersion();

  const tabs = useMemo(() => getProjectTabs(pname), [pname]);
  const activeTab = toProjectTab(useRouteTab(tabs));
  const views = useMemo(() => getProjectBlueprintViews(pname), [pname]);
  const view = useBlueprintView(views);

  const { ready, data, error } = useRefreshData((signal) => API.project.get(pname, signal), [pname, version]);
  const loaded = useLastLoaded(data, pname);
  const project = error ? undefined : loaded;

  useEffect(() => {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      message.error(COPY.notFound(pname));
      const timer = setTimeout(() => navigate(PATHS.PROJECTS(), { replace: true }), NOT_FOUND_REDIRECT_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [error, navigate, pname]);

  if (!project) {
    return !ready && !error ? <PageLoading /> : null;
  }

  const panels = {
    [PROJECT_TAB.BLUEPRINT]: project.blueprint ? (
      <BlueprintDetail blueprintId={project.blueprint.id} context={BLUEPRINT_CONTEXT.PROJECT} view={view} />
    ) : (
      <EmptyState
        size={EMPTY_STATE_SIZE.SECTION}
        title={COPY.noBlueprint.title}
        description={COPY.noBlueprint.description}
      />
    ),
    [PROJECT_TAB.WEBHOOKS]: <WebhooksPanel project={project} onRefresh={refresh} />,
    [PROJECT_TAB.CLAUDE_CODE_OTEL]: <ClaudeCodeOtelPanel projectName={project.name} />,
    [PROJECT_TAB.SETTINGS]: <SettingsPanel project={project} onRefresh={refresh} />,
  };

  return (
    <ListPage>
      <PageHeader
        title={project.name}
        breadcrumbs={[
          { label: COPY.breadcrumbProjects, path: PATHS.PROJECTS() },
          { label: project.name, path: PATHS.PROJECT_TAB(pname, PROJECT_TAB.BLUEPRINT) },
        ]}
        switcher={
          activeTab === PROJECT_TAB.BLUEPRINT ? (
            <RouteTabs items={views} variant={ROUTE_TABS_VARIANT.SEGMENTED} />
          ) : undefined
        }
      />
      <RouteTabs items={tabs} variant={ROUTE_TABS_VARIANT.TABS} />
      {panels[activeTab]}
    </ListPage>
  );
};
