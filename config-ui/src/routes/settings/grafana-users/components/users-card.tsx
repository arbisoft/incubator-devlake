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
import {
  ConfirmModal,
  DataTable,
  EMPTY_ILLUSTRATION,
  ListToolbar,
  SectionCard,
  buildListEmpty,
  useLastLoaded,
  useListState,
  useRefreshVersion,
} from '@/ui';

import { TemporaryPasswordModal } from '../../components';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../constants';
import { getGrafanaUserColumns } from '../columns';
import { COPY, GRAFANA_DIALOG, GRAFANA_MENU_ACTION, GRAFANA_ROW_ACTION } from '../constants';
import { useDialogState, useGrafanaRowActions } from '../hooks';
import type { GrafanaColumnActions, GrafanaDialog, OneTimePassword } from '../types';
import { toGrafanaListParams } from '../utils';

import { AddUserModal } from './add-user-modal';
import { EditDetailsModal } from './edit-details-modal';
import { OrphansModal } from './orphans-modal';
import { OrphansNotice } from './orphans-notice';
import { ProjectsModal } from './projects-modal';
import { SetPasswordModal } from './set-password-modal';

export const GrafanaUsersCard = () => {
  const list = useListState<string, Record<string, string>>({
    pageSize: DEFAULT_PAGE_SIZE,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    filters: {},
  });
  const { version, refresh } = useRefreshVersion();
  const users = useRefreshData(
    (signal) => API.grafanaUsers.listUsers(toGrafanaListParams(list.query), signal),
    [version, list.query],
  );
  const loaded = useLastLoaded(users.data, list.query);
  const dialog = useDialogState();
  const { open: openDialog, close: closeDialog } = dialog;
  const [oneTime, setOneTime] = useState<OneTimePassword>();
  const [oneTimeOpen, setOneTimeOpen] = useState(false);
  const { requestAction, changeRole, confirmProps } = useGrafanaRowActions(refresh);
  const orphans = loaded?.orphans ?? [];

  const columns = useMemo(() => {
    const actions: GrafanaColumnActions = {
      onRoleChange: changeRole,
      onToggle: requestAction,
      onRemove: (user) => requestAction(GRAFANA_ROW_ACTION.DELETE, user),
      onEditProjects: (user) => openDialog(GRAFANA_DIALOG.PROJECTS, user),
      onMenuAction: (user, action) =>
        openDialog(action === GRAFANA_MENU_ACTION.PASSWORD ? GRAFANA_DIALOG.PASSWORD : GRAFANA_DIALOG.DETAILS, user),
    };
    return getGrafanaUserColumns(actions);
  }, [changeRole, openDialog, requestAction]);

  const showPassword = (credential: OneTimePassword) => {
    setOneTime(credential);
    setOneTimeOpen(true);
  };

  const addUserButton = (
    <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => openDialog(GRAFANA_DIALOG.ADD)}>
      {COPY.actions.addUser}
    </Button>
  );

  const empty = buildListEmpty({
    failed: users.error !== undefined,
    onRetry: refresh,
    filtered: list.keyword !== '',
    empty: { ...COPY.empty, illustration: EMPTY_ILLUSTRATION.NO_USERS, action: addUserButton },
    noResults: COPY.noResults,
  });
  const dialogProps = { onClose: closeDialog, onChanged: refresh };
  const isOpen = (kind: GrafanaDialog) => dialog.kind === kind;

  return (
    <>
      <SectionCard
        title={COPY.title}
        count={loaded?.count}
        actions={<ListToolbar list={list} searchPlaceholder={COPY.searchPlaceholder} end={addUserButton} />}
      >
        {orphans.length > 0 && (
          <OrphansNotice count={orphans.length} onReview={() => openDialog(GRAFANA_DIALOG.ORPHANS)} />
        )}
        <DataTable
          rowKey="id"
          ariaLabel={COPY.tableLabel}
          loading={!users.ready && users.error === undefined}
          columns={columns}
          dataSource={loaded?.users ?? []}
          empty={empty}
          list={list}
          total={loaded?.count ?? 0}
        />
      </SectionCard>
      <AddUserModal
        key={`add-${dialog.session}`}
        open={isOpen(GRAFANA_DIALOG.ADD)}
        onPassword={showPassword}
        {...dialogProps}
      />
      <EditDetailsModal
        key={`details-${dialog.session}`}
        open={isOpen(GRAFANA_DIALOG.DETAILS)}
        user={dialog.user}
        {...dialogProps}
      />
      <ProjectsModal
        key={`projects-${dialog.session}`}
        open={isOpen(GRAFANA_DIALOG.PROJECTS)}
        user={dialog.user}
        {...dialogProps}
      />
      <SetPasswordModal
        key={`password-${dialog.session}`}
        open={isOpen(GRAFANA_DIALOG.PASSWORD)}
        user={dialog.user}
        onPassword={showPassword}
        {...dialogProps}
      />
      <OrphansModal open={isOpen(GRAFANA_DIALOG.ORPHANS)} orphans={orphans} {...dialogProps} />
      <TemporaryPasswordModal
        open={oneTimeOpen}
        credential={oneTime && { loginName: oneTime.email, temporaryPassword: oneTime.password }}
        copy={oneTime && { ...COPY.password.oneTime, hint: COPY.password.oneTime.hint(oneTime.email) }}
        onClose={() => setOneTimeOpen(false)}
        onClosed={() => setOneTime(undefined)}
      />
      <ConfirmModal {...confirmProps} />
    </>
  );
};
