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
import { FormModal, useModalForm } from '@/ui';
import { operator } from '@/utils';

import { Fields, Hint } from '../../components';
import { COPY, GRAFANA_FLOW_ERRORS } from '../constants';
import { getFlowError, isValidPassword } from '../utils';

import { PasswordField } from './password-field';
import type { SetPasswordModalProps } from './types';

const copy = COPY.setPassword;

export const SetPasswordModal = ({ open, user, onClose, onChanged, onPassword }: SetPasswordModalProps) => {
  const { values, setField, reset, setSaving, modalProps } = useModalForm(
    { password: '' },
    { onClose, required: ['password'], disabledReason: copy.disabledReason },
  );

  const handleSubmit = async () => {
    if (!user) return;
    const [success] = await operator(() => API.grafanaUsers.setPassword(user.id, values.password), {
      setOperating: setSaving,
      formatReason: getFlowError(GRAFANA_FLOW_ERRORS.PASSWORD),
    });
    if (!success) return;
    onChanged();
    onPassword({ email: user.email, password: values.password });
    reset();
    onClose();
  };

  return (
    <FormModal
      open={open}
      title={copy.title}
      icon={<LockOutlined aria-hidden />}
      submitLabel={copy.submit}
      onSubmit={handleSubmit}
      {...modalProps}
      submitDisabled={!isValidPassword(values.password)}
    >
      <Fields>
        <Hint>{copy.description(user?.email ?? '')}</Hint>
        <PasswordField value={values.password} onChange={(value) => setField('password', value)} />
      </Fields>
    </FormModal>
  );
};
