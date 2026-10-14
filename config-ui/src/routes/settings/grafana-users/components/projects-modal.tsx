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

import { ProjectOutlined } from '@ant-design/icons';

import API from '@/api';
import { FormModal, useModalForm } from '@/ui';
import { operator } from '@/utils';

import { Fields, Hint } from '../../components';
import { COPY, GRAFANA_FLOW_ERRORS } from '../constants';
import { getFlowError } from '../utils';

import { ProjectsPicker } from './projects-picker';
import type { UserDialogProps } from './types';

const copy = COPY.projects;

export const ProjectsModal = ({ open, user, onClose, onChanged }: UserDialogProps) => {
  const { values, setField, reset, setSaving, modalProps } = useModalForm(
    { projects: user?.projects ?? [] },
    { onClose, required: [], disabledReason: '' },
  );

  const handleSubmit = async () => {
    if (!user) return;
    const [success] = await operator(() => API.grafanaUsers.setProjects(user.id, values.projects), {
      setOperating: setSaving,
      formatReason: getFlowError(GRAFANA_FLOW_ERRORS.PROJECTS),
    });
    if (!success) return;
    onChanged();
    reset();
    onClose();
  };

  return (
    <FormModal
      open={open}
      title={copy.title}
      icon={<ProjectOutlined aria-hidden />}
      submitLabel={copy.submit}
      onSubmit={handleSubmit}
      {...modalProps}
    >
      <Fields>
        <Hint>{copy.description(user?.email ?? '')}</Hint>
        <ProjectsPicker value={values.projects} onChange={(projects) => setField('projects', projects)} />
        {values.projects.length === 0 && <Hint>{copy.emptyHint}</Hint>}
      </Fields>
    </FormModal>
  );
};
