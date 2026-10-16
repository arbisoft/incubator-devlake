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

import { message } from 'antd';
import { useState } from 'react';

import API from '@/api';
import { PATHS } from '@/config';
import { toUserMessage } from '@/ui/utils';
import { operator } from '@/utils';

import { COPY, NO_SCOPE_CONFIG_ID, SCOPE_CONFIG_DIALOG } from './constants';
import type { ProjectRef, RelatedProject, ScopeConfigDialog, ScopeConfigProps } from './types';
import { toCheckedProjectRefs, toProjectRefs, toRelatedProjects } from './utils';

type Options = Pick<
  ScopeConfigProps,
  'plugin' | 'connectionId' | 'scopeId' | 'scopeName' | 'scopeConfigId' | 'onSuccess'
>;

export const useScopeConfigFlow = ({ plugin, connectionId, scopeId, scopeName, scopeConfigId, onSuccess }: Options) => {
  const [dialog, setDialog] = useState<ScopeConfigDialog>();
  const [relatedProjects, setRelatedProjects] = useState<RelatedProject[]>([]);
  const [savedProjects, setSavedProjects] = useState<ProjectRef[]>();
  const [operating, setOperating] = useState(false);

  const closeDialog = () => setDialog(undefined);

  const closeSaved = () => {
    setSavedProjects(undefined);
    onSuccess();
  };

  const showSaved = (projects: ProjectRef[]) => {
    if (projects.length) {
      setSavedProjects(projects);
    } else {
      onSuccess();
    }
  };

  const checkScopeConfig = async (id: ID) => {
    const [success, res] = await operator(() => API.scopeConfig.check(plugin, id), {
      hideToast: true,
    });

    if (!success) {
      message.error(toUserMessage(res, {}, COPY.checkFailed));
      return;
    }

    const projects = toRelatedProjects(res.projects);
    if (projects.length > 1) {
      setRelatedProjects(projects);
      setDialog(SCOPE_CONFIG_DIALOG.RELATED_PROJECTS);
    } else {
      setDialog(SCOPE_CONFIG_DIALOG.UPDATE);
    }
  };

  const retransform = async ({ name, blueprintId }: ProjectRef) => {
    const [success] = await operator(() => API.blueprint.trigger(blueprintId, { skipCollectors: true }), {
      setOperating,
      formatReason: (error) => toUserMessage(error, {}, COPY.retransformFailed),
    });

    if (success) {
      window.open(PATHS.PROJECT(name));
    }
  };

  const associate = async (id: ID) => {
    const [success, res] = await operator(
      async () => {
        await API.scope.update(plugin, connectionId, scopeId, {
          scopeConfigId: id === NO_SCOPE_CONFIG_ID ? null : +id,
        });
        return API.scope.get(plugin, connectionId, scopeId, { blueprints: true });
      },
      { hideToast: true },
    );

    if (success) {
      closeDialog();
      showSaved(toProjectRefs(res.blueprints));
    } else {
      message.error(toUserMessage(res, {}, COPY.associateFailed));
    }
  };

  const update = async (id: ID) => {
    closeDialog();

    const [success, res] = await operator(() => API.scopeConfig.check(plugin, id), { hideToast: true });

    if (success) {
      showSaved(toCheckedProjectRefs(res.projects));
    } else {
      message.error(toUserMessage(res, {}, COPY.checkFailed));
    }
  };

  return {
    dialog,
    relatedProjects,
    savedProjects,
    operating,
    scopeName,
    scopeConfigId,
    openAssociate: () => setDialog(SCOPE_CONFIG_DIALOG.ASSOCIATE),
    openUpdate: () => scopeConfigId && checkScopeConfig(scopeConfigId),
    openDuplicate: () => setDialog(SCOPE_CONFIG_DIALOG.DUPLICATE),
    continueUpdate: () => setDialog(SCOPE_CONFIG_DIALOG.UPDATE),
    closeDialog,
    closeSaved,
    retransform,
    associate,
    update,
  };
};
