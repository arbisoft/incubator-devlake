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
import { useMemo, useState } from 'react';

import API from '@/api';
import { useRefreshData } from '@/hooks';
import type { IApiKey } from '@/types';
import {
  CONFIRM_TONE,
  ConfirmModal,
  DataTable,
  ListPage,
  ListToolbar,
  PageHeader,
  buildListEmpty,
  useListState,
  useRefreshVersion,
} from '@/ui';
import { operator } from '@/utils';

import { getColumns } from './columns';
import { GeneratedKeyModal, NewKeyModal } from './components';
import { COPY } from './constants';
import type { KeySortKey } from './types';
import { getPathPrefix } from './utils';

export const ApiKeys = () => {
  const list = useListState<KeySortKey, Record<string, never>>({ filters: {} });
  const { keyword } = list;
  const { version, refresh } = useRefreshVersion();
  const [creating, setCreating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string>();
  const [generatedOpen, setGeneratedOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<IApiKey>();
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const { data, ready, error } = useRefreshData(() => API.apiKey.list(list.query), [version, list.query]);

  const pathPrefix = useMemo(() => getPathPrefix(window.location.origin), []);
  const columns = useMemo(
    () =>
      getColumns({
        pathPrefix,
        onRevoke: (key) => {
          setRevokeTarget(key);
          setRevokeOpen(true);
        },
      }),
    [pathPrefix],
  );

  const handleCreated = (apiKey: string) => {
    setCreating(false);
    setGeneratedKey(apiKey);
    setGeneratedOpen(true);
    refresh();
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const [success] = await operator(() => API.apiKey.remove(revokeTarget.id), { setOperating: setRevoking });
    if (success) {
      setRevokeOpen(false);
      refresh();
    }
  };

  const newKeyButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
      {COPY.newKey}
    </Button>
  );

  const empty = buildListEmpty({
    failed: error !== undefined,
    onRetry: refresh,
    filtered: keyword !== '',
    empty: {
      ...COPY.empty,
      action: newKeyButton,
    },
    noResults: COPY.noResults,
  });

  return (
    <ListPage>
      <PageHeader title={COPY.title} description={COPY.description} />
      <ListToolbar list={list} searchPlaceholder={COPY.searchPlaceholder} end={newKeyButton} />
      <DataTable<IApiKey, KeySortKey>
        rowKey="id"
        ariaLabel={COPY.tableLabel}
        loading={!ready && error === undefined}
        columns={columns}
        dataSource={data?.apikeys ?? []}
        empty={empty}
        list={list}
        total={data?.count ?? 0}
      />
      <NewKeyModal open={creating} onClose={() => setCreating(false)} onCreated={handleCreated} />
      <GeneratedKeyModal
        open={generatedOpen}
        apiKey={generatedKey}
        onClose={() => setGeneratedOpen(false)}
        onClosed={() => setGeneratedKey(undefined)}
      />
      <ConfirmModal
        open={revokeOpen}
        tone={CONFIRM_TONE.DANGER}
        title={COPY.confirm.title(revokeTarget?.name ?? '')}
        description={COPY.confirm.description}
        confirmLabel={COPY.confirm.confirm}
        loading={revoking}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeOpen(false)}
      />
    </ListPage>
  );
};
