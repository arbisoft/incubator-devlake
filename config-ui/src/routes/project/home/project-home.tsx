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

import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import API from '@/api';
import { BLUEPRINT_VIEW, PATHS } from '@/config';
import { useRefreshData } from '@/hooks';
import { OnboardTour } from '@/routes/onboard/components';
import { DataTable, ListPage, ListToolbar, PageHeader, buildListEmpty, useListState, useRefreshVersion } from '@/ui';

import { NewProjectModal } from './components';
import { COPY } from './constants';
import type { ProjectRow, ProjectSortKey } from './types';
import { useProjectColumns } from './use-project-columns';
import { toProjectRow } from './utils';

export const ProjectHomePage = () => {
  const list = useListState<ProjectSortKey, Record<string, never>>({ filters: {} });
  const { keyword } = list;
  const { version, refresh } = useRefreshVersion();
  const [creating, setCreating] = useState(false);

  const navigate = useNavigate();

  const { data, ready, error } = useRefreshData(
    (signal) => API.project.list(list.query, signal),
    [version, list.query],
  );
  const { data: otelConnections } = useRefreshData(() => API.otel.list(), []);

  const rows = useMemo(
    () => (data?.projects ?? []).map((project) => toProjectRow(project, otelConnections)),
    [data, otelConnections],
  );

  const handleConfigure = useCallback(
    (name: string) => navigate(PATHS.PROJECT_BLUEPRINT_VIEW(name, BLUEPRINT_VIEW.CONFIGURATION)),
    [navigate],
  );
  const { columns, tourRefs } = useProjectColumns(handleConfigure);

  const handleCreated = () => {
    setCreating(false);
    list.setKeyword('');
    refresh();
  };

  const newProjectButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
      {COPY.newProject}
    </Button>
  );

  const empty = buildListEmpty({
    failed: error !== undefined,
    onRetry: refresh,
    filtered: keyword !== '',
    empty: {
      ...COPY.empty,
      action: newProjectButton,
    },
    noResults: COPY.noResults,
  });

  return (
    <ListPage>
      <PageHeader title={COPY.title} />
      <ListToolbar list={list} searchPlaceholder={COPY.searchPlaceholder} end={newProjectButton} />
      <DataTable<ProjectRow, ProjectSortKey>
        rowKey="name"
        ariaLabel={COPY.tableLabel}
        loading={!ready && error === undefined}
        columns={columns}
        dataSource={rows}
        empty={empty}
        list={list}
        total={data?.count ?? 0}
      />
      <NewProjectModal open={creating} onClose={() => setCreating(false)} onCreated={handleCreated} />
      {ready && rows.length === 1 && <OnboardTour {...tourRefs} />}
    </ListPage>
  );
};
