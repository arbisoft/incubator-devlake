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

import { DeleteOutlined } from '@ant-design/icons';
import { Alert, Button, Input, message } from 'antd';
import { isEqual } from 'lodash';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import API from '@/api';
import { PATHS, PROJECT_TAB } from '@/config';
import { useRefreshData } from '@/hooks';
import { getOtelProjectError } from '@/routes/otel/utils';
import { COMMON_COPY, FormField, SectionCard, SettingOption, Toolbar, toUserMessage, useRefreshVersion } from '@/ui';
import { operator } from '@/utils';

import { COPY, DEFAULT_PR_ISSUE_REGEXP, SAVE_ERROR_MAP } from './constants';
import { DeleteProjectModal } from './delete-project-modal';
import { ReadinessCard } from './readiness-card';
import { RegexHelp } from './regex-help';
import { FieldBox, Fields, Footer, Stack } from './styled';
import type { ProjectPanelProps, SettingsForm } from './types';
import {
  buildProjectPayload,
  getDeleteWarnings,
  getOtelPlacementState,
  getProjectDeleteError,
  readSettingsForm,
} from './utils';

export const SettingsPanel = ({ project, onRefresh }: ProjectPanelProps) => {
  const [source, setSource] = useState(project);
  const [form, setForm] = useState(() => readSettingsForm(project));
  const [operating, setOperating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const { version, refresh } = useRefreshVersion();

  const {
    data: otelConnections,
    ready: otelReady,
    error: otelError,
  } = useRefreshData((signal) => API.otel.listForProject(project.name, signal), [project.name, version]);
  const placementsAuthoritative = otelReady && otelError === undefined && Array.isArray(otelConnections);
  const placementsFailed = otelError !== undefined || (otelReady && !Array.isArray(otelConnections));
  const placements = getOtelPlacementState(placementsAuthoritative ? otelConnections : undefined);
  const dirty = !isEqual(form, readSettingsForm(project));

  if (source !== project) {
    setSource(project);
    setForm(readSettingsForm(project));
  }

  const setField = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSave = async () => {
    const [success] = await operator(
      () => API.project.update(project.name, buildProjectPayload(form, project.description)),
      {
        setOperating,
        formatMessage: () => COPY.settings.saved,
        formatReason: (error) => toUserMessage(error, SAVE_ERROR_MAP, COPY.settings.saveFailed),
      },
    );

    if (!success) return;
    // The new name's page loads the saved project itself, so only an unchanged name needs a refresh.
    if (form.name === project.name) onRefresh();
    else navigate(PATHS.PROJECT_TAB(form.name, PROJECT_TAB.SETTINGS));
  };

  const handleDelete = async () => {
    if (!placementsAuthoritative) return;
    if (placements.hasPlacements) {
      const [prepared, reason] = await operator(() => API.otel.validateProjectRemoval(project.name), {
        setOperating,
        hideToast: true,
        formatReason: getOtelProjectError,
      });
      if (!prepared) {
        message.error(getOtelProjectError(reason));
        return;
      }
    }
    const [success] = await operator(() => API.project.remove(project.name), {
      setOperating,
      formatMessage: () => COPY.settings.delete.success,
      formatReason: getProjectDeleteError,
    });

    if (success) {
      navigate(PATHS.PROJECTS());
    }
  };

  return (
    <Stack>
      {placementsFailed && (
        <Alert
          type="error"
          showIcon
          title={COPY.settings.delete.placementsFailed}
          action={<Button onClick={refresh}>{COMMON_COPY.retry}</Button>}
        />
      )}
      <Toolbar
        end={
          <Button
            danger
            icon={<DeleteOutlined aria-hidden />}
            disabled={!placementsAuthoritative}
            onClick={() => setDeleting(true)}
          >
            {COPY.settings.delete.open}
          </Button>
        }
      />
      <SectionCard title={COPY.settings.details}>
        <Fields>
          <FieldBox>
            <FormField label={COPY.settings.name.label} description={COPY.settings.name.description} required>
              {(control) => (
                <Input {...control} value={form.name} onChange={(event) => setField('name', event.target.value)} />
              )}
            </FormField>
          </FieldBox>
          <div>
            <SettingOption
              label={COPY.settings.dora.label}
              description={COPY.settings.dora.description}
              checked={form.dora}
              onChange={(checked) => setField('dora', checked)}
            />
            <SettingOption
              label={COPY.settings.linker.label}
              description={COPY.settings.linker.description}
              checked={form.linker}
              aside={<RegexHelp />}
              onChange={(checked) => setField('linker', checked)}
            >
              {form.linker && (
                <Input
                  aria-label={COPY.settings.linker.regexLabel}
                  placeholder={DEFAULT_PR_ISSUE_REGEXP}
                  value={form.linkerRegexp}
                  onChange={(event) => setField('linkerRegexp', event.target.value)}
                />
              )}
            </SettingOption>
            <SettingOption
              label={COPY.settings.issueTrace.label}
              description={COPY.settings.issueTrace.description}
              checked={form.issueTrace}
              onChange={(checked) => setField('issueTrace', checked)}
            />
          </div>
          <Footer>
            <Button type="primary" loading={operating} disabled={!form.name} onClick={handleSave}>
              {COPY.settings.save}
            </Button>
            <Button disabled={!dirty || operating} onClick={() => setForm(readSettingsForm(project))}>
              {COPY.settings.discard}
            </Button>
          </Footer>
        </Fields>
      </SectionCard>
      <ReadinessCard projectName={project.name} />
      <DeleteProjectModal
        open={deleting}
        name={project.name}
        warnings={getDeleteWarnings(placements)}
        loading={operating}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(false)}
      />
    </Stack>
  );
};
