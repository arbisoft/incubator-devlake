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

import { ApartmentOutlined } from '@ant-design/icons';
import { useEffect } from 'react';

import API from '@/api';
import { FormModal, MODAL_WIDTH, useModalForm } from '@/ui';
import { operator } from '@/utils';

import { Fields, Hint } from '../styled';
import type { ProjectsModalProps } from '../types';
import { getOtelProjectError } from '../utils';

import { COPY } from './constants';
import { ProjectSelectField } from './project-select';

const INITIAL_FORM: { projectNames: string[] } = { projectNames: [] };

export const ProjectsModal = ({ open, connection, projectOptions, onClose, onSaved }: ProjectsModalProps) => {
  const { values, setField, setSaving, modalProps } = useModalForm(INITIAL_FORM, {
    onClose,
    required: [],
    disabledReason: COPY.projectsModal.disabledReason,
  });
  const teamName = connection?.connection.teamName ?? '';

  useEffect(() => {
    if (open && connection) {
      setField(
        'projectNames',
        connection.projects.map(({ name }) => name),
      );
    }
  }, [open, connection, setField]);

  const submit = async () => {
    if (!connection) return;
    const [success] = await operator(() => API.otel.updateProjects(connection.connection.id, values.projectNames), {
      setOperating: setSaving,
      formatMessage: () => COPY.projectsModal.updated,
      formatReason: getOtelProjectError,
    });
    if (success) onSaved();
  };

  return (
    <FormModal
      {...modalProps}
      open={open}
      width={MODAL_WIDTH.MD}
      icon={<ApartmentOutlined aria-hidden />}
      title={COPY.projectsModal.title}
      submitLabel={COPY.projectsModal.submit}
      submitDisabled={values.projectNames.length === 0}
      onSubmit={submit}
    >
      <Fields>
        <ProjectSelectField
          label={COPY.projectsModal.projectsFor(teamName)}
          value={values.projectNames}
          options={projectOptions}
          onChange={(names) => setField('projectNames', names)}
        />
        <Hint>{COPY.projectsModal.note}</Hint>
      </Fields>
    </FormModal>
  );
};
