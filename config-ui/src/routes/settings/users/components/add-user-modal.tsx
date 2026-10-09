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

import { UserOutlined } from '@ant-design/icons';

import API from '@/api';
import { ACCESS_ROLE, type AccessRole } from '@/api/access';
import { operator } from '@/utils';

import { AccessFormModal, TextField } from '../../components';
import { COPY } from '../../constants';
import { getCreateUserError, isValidEmail } from '../../utils';

import type { AddUserModalProps } from './types';

const INITIAL_FORM: { email: string; role: AccessRole } = { email: '', role: ACCESS_ROLE.MEMBER };
const copy = COPY.modals.addUser;

export const AddUserModal = ({ open, onClose, onCreated }: AddUserModalProps) => (
  <AccessFormModal
    open={open}
    onClose={onClose}
    copy={copy}
    icon={<UserOutlined aria-hidden />}
    initial={INITIAL_FORM}
    required={['email']}
    isValid={({ email }) => isValidEmail(email)}
    submit={async ({ email, role }, setSaving) => {
      const [success] = await operator(() => API.access.createUser({ email: email.trim().toLowerCase(), role }), {
        setOperating: setSaving,
        formatReason: getCreateUserError,
      });
      if (success) onCreated();
      return success;
    }}
  >
    {({ email }, setField) => (
      <>
        <TextField
          label={copy.email.label}
          placeholder={copy.email.placeholder}
          value={email}
          error={email.length > 0 && !isValidEmail(email) ? copy.invalidEmail : undefined}
          required
          onChange={(value) => setField('email', value)}
        />
      </>
    )}
  </AccessFormModal>
);
