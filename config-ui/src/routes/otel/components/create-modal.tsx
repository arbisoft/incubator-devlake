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

import { ApiOutlined } from '@ant-design/icons';
import { Input, message } from 'antd';
import { useEffect } from 'react';

import API from '@/api';
import { FormField, FormModal, MODAL_WIDTH, useModalForm } from '@/ui';
import { operator } from '@/utils';

import { COPY as OTEL_COPY } from '../constants';
import { Fields, Hint, Notes } from '../styled';
import type { CreateModalProps } from '../types';
import { getOtelCreateError } from '../utils';

import { COPY, TEAM_NAME_MAX_LENGTH } from './constants';
import { ProjectSelectField } from './project-select';

const INITIAL_FORM: { teamName: string; projectNames: string[] } = { teamName: '', projectNames: [] };

export const CreateModal = ({ open, presetProject, projectOptions, onClose, onCreated }: CreateModalProps) => {
  const { values, setField, reset, setSaving, modalProps } = useModalForm(INITIAL_FORM, {
    onClose,
    required: [],
    disabledReason: COPY.create.disabledReason,
  });
  const teamName = values.teamName.trim();
  const valid = teamName !== '' && values.projectNames.length > 0;

  useEffect(() => {
    if (open && presetProject) setField('projectNames', [presetProject]);
  }, [open, presetProject, setField]);

  const submit = async () => {
    const [success, response] = await operator(
      () => API.otel.create({ teamName: values.teamName, projectNames: values.projectNames }),
      { setOperating: setSaving, hideToast: true },
    );
    if (!success) {
      message.error(getOtelCreateError(response));
      return;
    }
    reset();
    onCreated(response);
  };

  return (
    <FormModal
      {...modalProps}
      open={open}
      width={MODAL_WIDTH.MD}
      icon={<ApiOutlined aria-hidden />}
      title={COPY.create.title}
      submitLabel={COPY.create.submit}
      submitDisabled={!valid}
      onSubmit={submit}
    >
      <Fields>
        <FormField label={COPY.create.teamName.label} required>
          {(control) => (
            <Input
              {...control}
              maxLength={TEAM_NAME_MAX_LENGTH}
              placeholder={COPY.create.teamName.placeholder}
              value={values.teamName}
              onChange={(event) => setField('teamName', event.target.value)}
            />
          )}
        </FormField>
        <ProjectSelectField
          label={COPY.create.projects.label}
          description={COPY.create.projects.hint}
          value={values.projectNames}
          options={projectOptions}
          onChange={(names) => setField('projectNames', names)}
        />
        <Notes>
          <Hint>{COPY.create.teamNotice}</Hint>
          <Hint>{OTEL_COPY.organization.createNotice}</Hint>
        </Notes>
      </Fields>
    </FormModal>
  );
};
