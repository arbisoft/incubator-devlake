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

import { MailOutlined } from '@ant-design/icons';

import API from '@/api';
import { ACCESS_ROLE, type AccessRole } from '@/api/access';
import { operator } from '@/utils';

import { AccessFormModal, TextField } from '../../components';
import { COPY } from '../../constants';
import { getCreateDomainError, isValidDomain, normalizeDomain } from '../../utils';

import type { AddDomainModalProps } from './types';

const INITIAL_FORM: { domain: string; role: AccessRole } = { domain: '', role: ACCESS_ROLE.MEMBER };
const copy = COPY.modals.addDomain;

export const AddDomainModal = ({ open, onClose, onCreated }: AddDomainModalProps) => (
  <AccessFormModal
    open={open}
    onClose={onClose}
    copy={copy}
    icon={<MailOutlined aria-hidden />}
    initial={INITIAL_FORM}
    required={['domain']}
    isValid={({ domain }) => isValidDomain(domain)}
    submit={async ({ domain, role }, setSaving) => {
      const [success] = await operator(
        () => API.access.createDomain({ domain: normalizeDomain(domain), defaultRole: role }),
        { setOperating: setSaving, formatReason: getCreateDomainError },
      );
      if (success) onCreated();
      return success;
    }}
  >
    {({ domain }, setField) => (
      <>
        <TextField
          label={copy.domain.label}
          placeholder={copy.domain.placeholder}
          value={domain}
          error={domain.length > 0 && !isValidDomain(domain) ? copy.invalidDomain : undefined}
          required
          onChange={(value) => setField('domain', value)}
        />
      </>
    )}
  </AccessFormModal>
);
