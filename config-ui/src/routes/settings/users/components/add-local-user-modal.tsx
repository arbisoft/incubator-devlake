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

import { UserAddOutlined } from '@ant-design/icons';

import API from '@/api';
import { ACCESS_ROLE, type AccessRole } from '@/api/access';
import { operator } from '@/utils';

import { AccessFormModal, LoginNameField, TextField } from '../../components';
import { COPY } from '../../constants';
import { getLocalCredentialError, isValidLocalLoginName } from '../../utils';

import type { AddLocalUserModalProps } from './types';

const INITIAL_FORM: { loginName: string; displayName: string; role: AccessRole } = {
  loginName: '',
  displayName: '',
  role: ACCESS_ROLE.MEMBER,
};
const copy = COPY.modals.addLocalUser;

export const AddLocalUserModal = ({ open, onClose, onCreated }: AddLocalUserModalProps) => (
  <AccessFormModal
    open={open}
    onClose={onClose}
    copy={copy}
    icon={<UserAddOutlined aria-hidden />}
    initial={INITIAL_FORM}
    required={['loginName']}
    isValid={({ loginName }) => isValidLocalLoginName(loginName)}
    submit={async ({ loginName, displayName, role }, setSaving) => {
      const [success, response] = await operator(
        () => API.access.createLocalUser({ loginName: loginName.trim(), displayName: displayName.trim(), role }),
        { setOperating: setSaving, formatReason: getLocalCredentialError },
      );
      if (success && response) onCreated(response);
      return Boolean(success && response);
    }}
  >
    {({ loginName, displayName }, setField) => (
      <>
        <LoginNameField value={loginName} onChange={(value) => setField('loginName', value)} />
        <TextField label={copy.name.label} value={displayName} onChange={(value) => setField('displayName', value)} />
      </>
    )}
  </AccessFormModal>
);
