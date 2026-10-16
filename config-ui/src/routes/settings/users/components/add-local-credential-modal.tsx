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

import { LockOutlined } from '@ant-design/icons';

import API from '@/api';
import { operator } from '@/utils';

import { AccessFormModal, LoginNameField } from '../../components';
import { COPY } from '../../constants';
import { getLocalCredentialError, isValidLocalLoginName } from '../../utils';

import type { AddLocalCredentialModalProps } from './types';

const INITIAL_FORM = { loginName: '' };
const copy = COPY.modals.addLocalCredential;

export const AddLocalCredentialModal = ({ open, user, onClose, onCreated }: AddLocalCredentialModalProps) => (
  <AccessFormModal
    open={open}
    onClose={onClose}
    copy={copy}
    icon={<LockOutlined aria-hidden />}
    initial={INITIAL_FORM}
    required={['loginName']}
    isValid={({ loginName }) => isValidLocalLoginName(loginName)}
    submit={async ({ loginName }, setSaving) => {
      if (!user) return false;
      const [success, response] = await operator(
        () => API.access.addLocalCredential(user.id, { loginName: loginName.trim() }),
        { setOperating: setSaving, formatReason: getLocalCredentialError },
      );
      if (success && response) onCreated(response);
      return Boolean(success && response);
    }}
  >
    {({ loginName }, setField) => (
      <LoginNameField value={loginName} onChange={(value) => setField('loginName', value)} />
    )}
  </AccessFormModal>
);
