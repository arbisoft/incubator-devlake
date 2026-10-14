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
import { Alert, Button, Space, Tooltip } from 'antd';
import { useCallback, useMemo, useState } from 'react';

import API from '@/api';
import type { OIDCProvider } from '@/api/access';
import { useRefreshData } from '@/hooks';
import {
  DataTable,
  EMPTY_ILLUSTRATION,
  EMPTY_STATE_SIZE,
  ConfirmModal,
  ListPage,
  PageHeader,
  SectionCard,
  Toolbar,
  buildListEmpty,
  useRefreshVersion,
} from '@/ui';

import { getAuthenticationState } from '../utils';

import { getProviderColumns } from './columns';
import { ProviderEditor } from './components';
import { COPY } from './constants';
import { useProviderActions } from './use-provider-actions';

export const SettingsAuthentication = () => {
  const { version, refresh } = useRefreshVersion();
  const [editorOpen, setEditorOpen] = useState(false);
  const [selected, setSelected] = useState<OIDCProvider>();
  const { start, confirmProps, error, clearError, isOperating, isActionOperating } = useProviderActions({
    onDone: refresh,
  });

  const { data, ready } = useRefreshData(async () => {
    const [providerResult, callbacks] = await Promise.all([
      API.access
        .listOIDCProviders()
        .then((providers) => ({ providers, loadFailed: false }))
        .catch(() => ({ providers: [], loadFailed: true })),
      API.access.getOIDCCallbacks().catch(() => undefined),
    ]);
    return { providerResult, callbacks };
  }, [version]);

  const providers = useMemo(() => data?.providerResult.providers ?? [], [data]);
  const loadFailed = data?.providerResult.loadFailed ?? false;
  const enabledProviderCount = useMemo(() => providers.filter((provider) => provider.enabled).length, [providers]);

  const openEditor = useCallback(
    (provider?: OIDCProvider) => {
      setSelected(provider);
      clearError();
      setEditorOpen(true);
    },
    [clearError],
  );

  const columns = useMemo(
    () =>
      getProviderColumns({
        enabledProviderCount,
        isOperating,
        isActionOperating,
        onEdit: openEditor,
        onAction: start,
      }),
    [enabledProviderCount, isOperating, isActionOperating, openEditor, start],
  );

  const addButton = (
    <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => openEditor()}>
      {COPY.addProvider}
    </Button>
  );
  const empty = buildListEmpty({
    failed: loadFailed,
    onRetry: refresh,
    filtered: false,
    empty: { ...COPY.empty, illustration: EMPTY_ILLUSTRATION.NO_USERS, action: addButton },
    noResults: COPY.empty,
  });

  return (
    <ListPage>
      <PageHeader title={COPY.title} description={COPY.description} />
      <Toolbar
        end={
          <Space size="small">
            <Tooltip title={COPY.stateTooltip}>
              <Button onClick={() => openEditor(providers[0])}>{getAuthenticationState(providers)}</Button>
            </Tooltip>
            {addButton}
          </Space>
        }
      />
      {error && <Alert type="error" showIcon title={error} />}
      <SectionCard title={COPY.sectionTitle} count={loadFailed ? undefined : providers.length}>
        <DataTable
          rowKey="providerKey"
          ariaLabel={COPY.tableLabel}
          loading={!ready}
          columns={columns}
          dataSource={providers}
          empty={loadFailed ? { ...empty, title: COPY.loadFailed, size: EMPTY_STATE_SIZE.SECTION } : empty}
        />
      </SectionCard>
      <ProviderEditor
        open={editorOpen}
        provider={selected}
        callbacks={data?.callbacks}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          setEditorOpen(false);
          refresh();
        }}
      />
      <ConfirmModal {...confirmProps} />
    </ListPage>
  );
};
