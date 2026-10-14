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
import { Alert, Select } from 'antd';
import type { LabeledValue } from 'antd/es/select';
import { useCallback, useState } from 'react';

import API from '@/api';
import { GRAFANA_ROLE } from '@/api/grafana-users/constants';
import type { GrafanaRole, GrafanaUser } from '@/api/grafana-users/types';
import { FormField, FormModal, useModalForm } from '@/ui';
import { operator } from '@/utils';

import { Fields, TextField } from '../../components';
import { isValidEmail } from '../../utils';
import { COPY, GRAFANA_FLOW_ERRORS, GRAFANA_ROLE_OPTIONS } from '../constants';
import type { DevlakeUserOption } from '../types';
import {
  buildCreateBody,
  generatePassword,
  getFlowError,
  getPartialUserId,
  isValidNewUser,
  normalizeEmail,
} from '../utils';

import { DevlakeUserSelect } from './devlake-user-select';
import { PasswordField } from './password-field';
import { ProjectsPicker } from './projects-picker';
import type { AddUserModalProps } from './types';

type AddForm = { email: string; name: string; password: string; role: GrafanaRole; projects: string[] };

const INITIAL_FORM: AddForm = { email: '', name: '', password: '', role: GRAFANA_ROLE.VIEWER, projects: [] };
const copy = COPY.add;
const PARTIAL_LOOKUP_PAGE_SIZE = 100;

const findPartialUser = async (id: ID, email: string): Promise<GrafanaUser | undefined> => {
  let pageCount = 1;
  for (let page = 1; page <= pageCount; page++) {
    const result = await API.grafanaUsers.listUsers({
      query: email,
      page,
      pageSize: PARTIAL_LOOKUP_PAGE_SIZE,
    });
    const found = result.users.find((user) => String(user.id) === String(id));
    if (found) return found;

    // The list count excludes the management user, which may still occupy a page slot.
    pageCount = Math.max(pageCount, Math.ceil((result.count + 1) / PARTIAL_LOOKUP_PAGE_SIZE));
  }
  return undefined;
};

const sameProjectSet = (left: string[], right: string[]): boolean => {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((project) => rightSet.has(project));
};

const finishPartial = async (id: ID, { email, role, projects }: AddForm): Promise<void> => {
  const current = await findPartialUser(id, normalizeEmail(email));
  if (!current || current.role !== role) await API.grafanaUsers.updateUser(id, { role });
  if (!current || !sameProjectSet(current.projects, projects)) await API.grafanaUsers.setProjects(id, projects);
};

export const AddUserModal = ({ open, onClose, onChanged, onPassword }: AddUserModalProps) => {
  const [partialId, setPartialId] = useState<ID>();
  const [picked, setPicked] = useState<LabeledValue>();
  const close = useCallback(() => {
    setPartialId(undefined);
    setPicked(undefined);
    onClose();
  }, [onClose]);
  const { values, setField, reset, setSaving, modalProps } = useModalForm<AddForm>(INITIAL_FORM, {
    onClose: close,
    required: [],
    disabledReason: copy.disabledReason,
  });
  const retrying = partialId !== undefined;

  const handlePick = (option?: DevlakeUserOption) => {
    setPicked(option && { value: option.value, label: option.label });
    if (!option) {
      reset();
      return;
    }
    setField('email', option.email);
    setField('name', option.name);
    setField('password', generatePassword());
  };

  const handleIdentityChange = (field: 'email' | 'name', value: string) => {
    setPicked(undefined);
    setField(field, value);
  };

  const handleSubmit = async () => {
    const [success, result] = await operator(
      async (): Promise<void> => {
        if (partialId === undefined) await API.grafanaUsers.createUser(buildCreateBody(values));
        else await finishPartial(partialId, values);
      },
      { setOperating: setSaving, formatReason: getFlowError(GRAFANA_FLOW_ERRORS.CREATE) },
    );
    if (!success) {
      const userId = getPartialUserId(result);
      if (userId !== undefined) {
        setPartialId(userId);
        onChanged();
      }
      return;
    }
    onChanged();
    onPassword({ email: normalizeEmail(values.email), password: values.password });
    reset();
    close();
  };

  return (
    <FormModal
      open={open}
      title={copy.title}
      icon={<UserAddOutlined aria-hidden />}
      submitLabel={retrying ? copy.retry : copy.submit}
      onSubmit={handleSubmit}
      {...modalProps}
      submitDisabled={!retrying && !isValidNewUser(values)}
    >
      <Fields>
        {retrying && <Alert type="warning" showIcon title={copy.partial} />}
        <DevlakeUserSelect value={picked} disabled={retrying} onPick={handlePick} />
        <TextField
          label={copy.email.label}
          placeholder={copy.email.placeholder}
          value={values.email}
          error={values.email.length > 0 && !isValidEmail(values.email) ? copy.invalidEmail : undefined}
          required
          disabled={retrying}
          onChange={(value) => handleIdentityChange('email', value)}
        />
        <TextField
          label={copy.name.label}
          placeholder={copy.name.placeholder}
          value={values.name}
          required
          disabled={retrying}
          onChange={(value) => handleIdentityChange('name', value)}
        />
        <PasswordField value={values.password} disabled={retrying} onChange={(value) => setField('password', value)} />
        <FormField label={copy.role.label} required>
          {(control) => (
            <Select<GrafanaRole>
              id={control.id}
              aria-required={control['aria-required']}
              size="large"
              options={GRAFANA_ROLE_OPTIONS}
              value={values.role}
              onChange={(role) => setField('role', role)}
            />
          )}
        </FormField>
        <ProjectsPicker value={values.projects} onChange={(projects) => setField('projects', projects)} />
      </Fields>
    </FormModal>
  );
};
