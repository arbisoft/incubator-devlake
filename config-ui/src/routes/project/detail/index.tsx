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

import { Alert, Button, message } from 'antd';
import axios, { HttpStatusCode } from 'axios';
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import API from '@/api';
import { PageLoading } from '@/components';
import { PATHS, PROJECT_TAB } from '@/config';
import { useRefreshData } from '@/hooks';
import { BLUEPRINT_CONTEXT, BlueprintDetail, getProjectBlueprintViews, useBlueprintView } from '@/routes';
import {
  EmptyState,
  EMPTY_ILLUSTRATION,
  EMPTY_STATE_SIZE,
  ListPage,
  PageHeader,
  RouteTabs,
  ROUTE_TABS_VARIANT,
  useLastLoaded,
  useRefreshVersion,
  COMMON_COPY,
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
  const project = loaded;

  useEffect(() => {
    if (axios.isAxiosError(error) && error.response?.status === HttpStatusCode.NotFound) {
      message.error(COPY.notFound(pname));
      const timer = setTimeout(() => navigate(PATHS.PROJECTS(), { replace: true }), NOT_FOUND_REDIRECT_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [error, navigate, pname]);

  if (!project) {
    if (!ready && error === undefined) return <PageLoading />;
    if (error !== undefined) {
      return (
        <ListPage>
          <EmptyState
            illustration={EMPTY_ILLUSTRATION.ERROR}
            size={EMPTY_STATE_SIZE.SECTION}
            title={COPY.loadFailed}
            action={<Button onClick={refresh}>{COMMON_COPY.retry}</Button>}
          />
        </ListPage>
      );
    }
    return null;
  }

  const panels = {
    [PROJECT_TAB.BLUEPRINT]: project.blueprint ? (
      <>
        <RouteTabs items={views} variant={ROUTE_TABS_VARIANT.SEGMENTED} />
        <BlueprintDetail blueprintId={project.blueprint.id} context={BLUEPRINT_CONTEXT.PROJECT} view={view} />
      </>
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
      {error !== undefined && (
        <Alert
          type="error"
          showIcon
          title={COPY.loadFailed}
          action={<Button onClick={refresh}>{COMMON_COPY.retry}</Button>}
        />
      )}
      <PageHeader
        title={project.name}
        showTitle={false}
        breadcrumbs={[
          { label: COPY.breadcrumbProjects, path: PATHS.PROJECTS() },
          { label: project.name, path: PATHS.PROJECT_TAB(pname, PROJECT_TAB.BLUEPRINT) },
        ]}
      />
      <RouteTabs items={tabs} variant={ROUTE_TABS_VARIANT.TABS} />
      {panels[activeTab]}
    </ListPage>
  );
};
