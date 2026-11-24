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

import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useMemo, useState } from 'react';

import API from '@/api';
import { useRefreshData } from '@/hooks';
import { DataTable, ListPage, ListToolbar, PageHeader, buildListEmpty, useListState, useRefreshVersion } from '@/ui';
import { operator } from '@/utils';

import { getColumns } from './columns';
import { EmailDrawer, MailStatusBanner } from './components';
import { COPY, DEFAULT_FILTERS, EMAIL_STATUS, FILTER_PARAM, PROJECT_OPTIONS_LIMIT, TEMPLATES } from './constants';
import { FilterSelect, ProjectSelect } from './styled';
import type { EmailHistoryItem, HistoryFilters, HistorySortKey } from './types';
import { buildHistoryQuery, getStatusLabel, getTemplateLabel, toDateRange } from './utils';

const statusOptions = Object.values(EMAIL_STATUS).map((value) => ({ value, label: getStatusLabel(value) }));
const templateOptions = TEMPLATES.map((value) => ({ value, label: getTemplateLabel(value) }));

export const EmailHistory = () => {
  const list = useListState<HistorySortKey, HistoryFilters>({ filters: DEFAULT_FILTERS });
  const { filters } = list;
  const { version, refresh } = useRefreshVersion();
  const [openId, setOpenId] = useState<number>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const query = useMemo(() => buildHistoryQuery(list.query, filters), [list.query, filters]);
  const { data, ready, error } = useRefreshData((signal) => API.mail.history(query, signal), [version, query]);
  const { data: status, error: statusError } = useRefreshData((signal) => API.mail.status(signal), []);
  const { data: projects } = useRefreshData(
    (signal) => API.project.list({ page: 1, pageSize: PROJECT_OPTIONS_LIMIT, namesOnly: true }, signal),
    [],
  );
  const projectOptions = useMemo(
    () => (projects?.projects ?? []).map(({ name }) => ({ value: name, label: name })),
    [projects],
  );

  const openRow = useCallback((row: EmailHistoryItem) => {
    setOpenId(row.id);
    setDrawerOpen(true);
  }, []);
  const columns = useMemo(() => getColumns(openRow), [openRow]);

  const sendTest = async () => {
    const [success] = await operator(() => API.mail.sendTest(), {
      setOperating: setSending,
      formatMessage: () => COPY.banner.testQueued,
    });
    if (success) refresh();
  };

  const empty = buildListEmpty({
    failed: error !== undefined,
    onRetry: refresh,
    filtered: list.isFiltered,
    empty: COPY.empty,
    noResults: COPY.noResults,
  });

  const toolbarFilters = (
    <>
      <FilterSelect
        allowClear
        aria-label={COPY.filters.status}
        placeholder={COPY.filters.status}
        options={statusOptions}
        value={filters.status || undefined}
        onChange={(value) => list.setFilter(FILTER_PARAM.STATUS, String(value ?? ''))}
      />
      <FilterSelect
        allowClear
        aria-label={COPY.filters.template}
        placeholder={COPY.filters.template}
        options={templateOptions}
        value={filters.template || undefined}
        onChange={(value) => list.setFilter(FILTER_PARAM.TEMPLATE, String(value ?? ''))}
      />
      <ProjectSelect
        allowClear
        showSearch
        aria-label={COPY.filters.project}
        placeholder={COPY.filters.project}
        options={projectOptions}
        value={filters.projectName || undefined}
        onChange={(value) => list.setFilter(FILTER_PARAM.PROJECT, String(value ?? ''))}
      />
      <DatePicker.RangePicker
        aria-label={COPY.filters.dateRange.join(' – ')}
        placeholder={COPY.filters.dateRange}
        value={[filters.from ? dayjs(filters.from) : null, filters.to ? dayjs(filters.to) : null]}
        onChange={(dates) => list.setFilters(toDateRange(dates?.[0]?.toDate(), dates?.[1]?.toDate()))}
      />
    </>
  );

  return (
    <ListPage>
      <PageHeader title={COPY.title} description={COPY.description} />
      <MailStatusBanner status={status} failed={statusError !== undefined} sending={sending} onSendTest={sendTest} />
      <ListToolbar list={list} searchPlaceholder={COPY.searchPlaceholder} filters={toolbarFilters} />
      <DataTable<EmailHistoryItem, HistorySortKey>
        rowKey="id"
        ariaLabel={COPY.tableLabel}
        loading={!ready && error === undefined}
        columns={columns}
        dataSource={data?.items ?? []}
        empty={empty}
        list={list}
        total={data?.count ?? 0}
      />
      <EmailDrawer open={drawerOpen} emailId={openId} onClose={() => setDrawerOpen(false)} />
    </ListPage>
  );
};
