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

import API from '@/api';
import { ACCESS_STATUS, type AccessUser, type LocalCredentialResponse } from '@/api/access';
import { useRefreshData } from '@/hooks';
import {
  ConfirmModal,
  DEFAULT_PAGE,
  DataTable,
  type DataTableFilters,
  EMPTY_ILLUSTRATION,
  ListToolbar,
  SectionCard,
  buildListEmpty,
  useListState,
  useRefreshVersion,
} from '@/ui';

import { TemporaryPasswordModal, type TemporaryCredential } from '../components';
import {
  ACCESS_MODAL,
  COPY,
  DEFAULT_PAGE_SIZE,
  LIFECYCLE_ACTION,
  LIFECYCLE_SUBJECT,
  PAGE_SIZE_OPTIONS,
  USER_COLUMN,
  USER_FILTER,
  USER_STATUS_FILTER_OPTIONS,
} from '../constants';
import type { AccessModal } from '../types';
import { useLifecycleAction } from '../use-lifecycle-action';
import { toAccessPagination, toStatusFilter } from '../utils';

import { getDomainColumns, getUserColumns } from './columns';
import { AddDomainModal, AddLocalCredentialModal, AddLocalUserModal, AddUserModal } from './components';

export const DevlakeUsers = () => {
  const list = useListState<string, Record<string, string>>({
    pageSize: DEFAULT_PAGE_SIZE,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    filters: { [USER_FILTER.STATUS]: '' },
  });
  const { keyword } = list;
  const status = toStatusFilter(list.filters[USER_FILTER.STATUS]);
  const { version, refresh } = useRefreshVersion();
  const [domainPage, setDomainPage] = useState(DEFAULT_PAGE);
  const [domainPageSize, setDomainPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [modal, setModal] = useState<AccessModal>();
  const [credentialUser, setCredentialUser] = useState<AccessUser>();
  const [temporaryCredential, setTemporaryCredential] = useState<TemporaryCredential>();
  const [credentialOpen, setCredentialOpen] = useState(false);

  const users = useRefreshData(
    (signal) =>
      API.access.listUsers({ ...toAccessPagination(list.query), keyword: list.query.keyword, status }, signal),
    [version, list.query, status],
  );
  const domains = useRefreshData(
    (signal) => API.access.listDomains(toAccessPagination({ page: domainPage, pageSize: domainPageSize }), signal),
    [version, domainPage, domainPageSize],
  );
  const methods = useRefreshData(() => API.auth.methods().catch(() => undefined), []);
  const localAuthEnabled = methods.data?.localPassword?.enabled === true;

  const { setFilter } = list;
  const handleFilterChange = useCallback(
    (filters: DataTableFilters) => {
      const [selected] = filters[USER_COLUMN.STATUS] ?? [];
      setFilter(USER_FILTER.STATUS, toStatusFilter(selected) ?? '');
    },
    [setFilter],
  );
  const closeModal = useCallback(() => setModal(undefined), []);
  const showCredential = useCallback((credential: LocalCredentialResponse) => {
    setTemporaryCredential({ loginName: credential.loginName, temporaryPassword: credential.temporaryPassword });
    setCredentialOpen(true);
  }, []);
  const handleCredentialCreated = useCallback(
    (credential: LocalCredentialResponse) => {
      setModal(undefined);
      showCredential(credential);
      refresh();
    },
    [refresh, showCredential],
  );
  const handleCreated = useCallback(() => {
    setModal(undefined);
    refresh();
  }, [refresh]);

  const { start, changeRole, confirmProps } = useLifecycleAction({ onDone: refresh, onCredential: showCredential });

  const userColumns = useMemo(
    () =>
      getUserColumns({
        onRoleChange: (user, role) => changeRole({ subject: LIFECYCLE_SUBJECT.USER, item: user }, role),
        onStatusChange: (user, status) =>
          start(status === ACCESS_STATUS.ACTIVE ? LIFECYCLE_ACTION.ENABLE : LIFECYCLE_ACTION.DISABLE, {
            subject: LIFECYCLE_SUBJECT.USER,
            item: user,
          }),
        onRemove: (user) => start(LIFECYCLE_ACTION.HIDE, { subject: LIFECYCLE_SUBJECT.USER, item: user }),
        onAddLocalCredential: (user) => {
          setCredentialUser(user);
          setModal(ACCESS_MODAL.LOCAL_CREDENTIAL);
        },
        onResetLocalCredential: (user) =>
          start(LIFECYCLE_ACTION.RESET_PASSWORD, { subject: LIFECYCLE_SUBJECT.USER, item: user }),
        onRemoveLocalCredential: (user) =>
          start(LIFECYCLE_ACTION.REMOVE_PASSWORD, { subject: LIFECYCLE_SUBJECT.USER, item: user }),
        localAuthEnabled,
        statusFilter: { value: status, options: USER_STATUS_FILTER_OPTIONS },
      }),
    [changeRole, localAuthEnabled, start, status],
  );

  const domainColumns = useMemo(
    () =>
      getDomainColumns({
        onRoleChange: (domain, role) => changeRole({ subject: LIFECYCLE_SUBJECT.DOMAIN, item: domain }, role),
        onStatusChange: (domain, status) =>
          start(status === ACCESS_STATUS.ACTIVE ? LIFECYCLE_ACTION.ENABLE : LIFECYCLE_ACTION.DISABLE, {
            subject: LIFECYCLE_SUBJECT.DOMAIN,
            item: domain,
          }),
        onRemove: (domain) => start(LIFECYCLE_ACTION.HIDE, { subject: LIFECYCLE_SUBJECT.DOMAIN, item: domain }),
      }),
    [changeRole, start],
  );

  const addUserButton = (
    <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => setModal(ACCESS_MODAL.USER)}>
      {COPY.users.addUser}
    </Button>
  );
  const addDomainButton = <Button onClick={() => setModal(ACCESS_MODAL.DOMAIN)}>{COPY.domains.addDomain}</Button>;

  const usersEmpty = buildListEmpty({
    failed: users.error !== undefined,
    onRetry: refresh,
    filtered: keyword !== '' || status !== undefined,
    empty: { ...COPY.users.empty, illustration: EMPTY_ILLUSTRATION.NO_USERS, action: addUserButton },
    noResults: COPY.users.noResults,
  });
  const domainsEmpty = buildListEmpty({
    failed: domains.error !== undefined,
    onRetry: refresh,
    filtered: false,
    empty: { ...COPY.domains.empty, action: addDomainButton },
    noResults: COPY.domains.empty,
  });

  return (
    <>
      <SectionCard
        title={COPY.users.title}
        count={users.data?.count}
        actions={
          <ListToolbar
            list={list}
            searchPlaceholder={COPY.users.searchPlaceholder}
            end={
              <>
                {localAuthEnabled && (
                  <Button onClick={() => setModal(ACCESS_MODAL.LOCAL_USER)}>{COPY.users.addLocalUser}</Button>
                )}
                {addUserButton}
              </>
            }
          />
        }
      >
        <DataTable
          rowKey="id"
          ariaLabel={COPY.users.tableLabel}
          loading={!users.ready && users.error === undefined}
          columns={userColumns}
          dataSource={users.data?.users ?? []}
          empty={usersEmpty}
          list={list}
          onFilterChange={handleFilterChange}
          total={users.data?.count ?? 0}
        />
      </SectionCard>
      <SectionCard
        title={COPY.domains.title}
        count={domains.data?.count}
        description={COPY.domains.description}
        actions={addDomainButton}
      >
        <DataTable
          rowKey="id"
          ariaLabel={COPY.domains.tableLabel}
          loading={!domains.ready && domains.error === undefined}
          columns={domainColumns}
          dataSource={domains.data?.domains ?? []}
          empty={domainsEmpty}
          pagination={{
            page: domainPage,
            pageSize: domainPageSize,
            total: domains.data?.count ?? 0,
            pageSizeOptions: PAGE_SIZE_OPTIONS,
            onPageChange: setDomainPage,
            onPageSizeChange: (pageSize) => {
              setDomainPageSize(pageSize);
              setDomainPage(DEFAULT_PAGE);
            },
          }}
        />
      </SectionCard>
      <AddUserModal open={modal === ACCESS_MODAL.USER} onClose={closeModal} onCreated={handleCreated} />
      <AddDomainModal open={modal === ACCESS_MODAL.DOMAIN} onClose={closeModal} onCreated={handleCreated} />
      <AddLocalUserModal
        open={modal === ACCESS_MODAL.LOCAL_USER}
        onClose={closeModal}
        onCreated={handleCredentialCreated}
      />
      <AddLocalCredentialModal
        open={modal === ACCESS_MODAL.LOCAL_CREDENTIAL}
        user={credentialUser}
        onClose={closeModal}
        onCreated={handleCredentialCreated}
      />
      <TemporaryPasswordModal
        open={credentialOpen}
        credential={temporaryCredential}
        onClose={() => setCredentialOpen(false)}
        onClosed={() => setTemporaryCredential(undefined)}
      />
      <ConfirmModal {...confirmProps} />
    </>
  );
};
