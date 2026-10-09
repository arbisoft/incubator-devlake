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

import { EditOutlined, LinkOutlined } from '@ant-design/icons';

import { MODAL_WIDTH, IconButton } from '@/ui';

import { ConnectionModal } from '../connection-modal';
import { ScopeConfigForm } from '../scope-config-form';
import { ScopeConfigSelectModal } from '../scope-config-select';

import { COPY, SCOPE_CONFIG_DIALOG, TAPD_PLUGIN } from './constants';
import { RelatedProjectsDialog } from './related-projects-dialog';
import { SavedDialog } from './saved-dialog';
import { Cell } from './styled';
import type { ScopeConfigProps } from './types';
import { useScopeConfigFlow } from './use-scope-config-flow';

export const ScopeConfig = ({
  plugin,
  connectionId,
  scopeId,
  scopeName,
  scopeConfigId,
  scopeConfigName,
  onSuccess,
}: ScopeConfigProps) => {
  const flow = useScopeConfigFlow({ plugin, connectionId, scopeId, scopeName, scopeConfigId, onSuccess });
  const { dialog } = flow;
  const isTapd = plugin === TAPD_PLUGIN;

  return (
    <Cell>
      <span>{scopeConfigId ? scopeConfigName : COPY.empty}</span>
      <IconButton icon={<LinkOutlined />} label={COPY.associate} onClick={flow.openAssociate} />
      {scopeConfigId && <IconButton icon={<EditOutlined />} label={COPY.edit} onClick={flow.openUpdate} />}
      {isTapd ? (
        <ConnectionModal
          open={dialog === SCOPE_CONFIG_DIALOG.ASSOCIATE}
          plugin={plugin}
          title={COPY.associate}
          width={MODAL_WIDTH.LG}
          onCancel={flow.closeDialog}
        >
          <ScopeConfigForm
            plugin={plugin}
            connectionId={connectionId}
            scopeConfigId={scopeConfigId}
            scopeId={scopeId}
            onCancel={flow.closeDialog}
            onSubmit={flow.associate}
          />
        </ConnectionModal>
      ) : (
        <ScopeConfigSelectModal
          open={dialog === SCOPE_CONFIG_DIALOG.ASSOCIATE}
          plugin={plugin}
          connectionId={connectionId}
          title={COPY.associate}
          scopeConfigId={scopeConfigId}
          onCancel={flow.closeDialog}
          onSubmit={flow.associate}
        />
      )}
      <ConnectionModal
        open={dialog === SCOPE_CONFIG_DIALOG.UPDATE}
        plugin={plugin}
        title={COPY.edit}
        width={MODAL_WIDTH.LG}
        onCancel={flow.closeDialog}
      >
        <ScopeConfigForm
          plugin={plugin}
          connectionId={connectionId}
          showWarning
          scopeConfigId={scopeConfigId}
          scopeId={scopeId}
          onCancel={flow.closeDialog}
          onSubmit={flow.update}
        />
      </ConnectionModal>
      <ConnectionModal
        open={dialog === SCOPE_CONFIG_DIALOG.DUPLICATE}
        plugin={plugin}
        title={COPY.edit}
        width={MODAL_WIDTH.LG}
        onCancel={flow.closeDialog}
      >
        <ScopeConfigForm
          plugin={plugin}
          connectionId={connectionId}
          showWarning
          forceCreate
          scopeConfigId={scopeConfigId}
          scopeId={scopeId}
          onCancel={flow.closeDialog}
          onSubmit={flow.associate}
        />
      </ConnectionModal>
      <RelatedProjectsDialog
        open={dialog === SCOPE_CONFIG_DIALOG.RELATED_PROJECTS}
        plugin={plugin}
        title={COPY.related.title(scopeConfigName, scopeName)}
        scopeName={scopeName}
        projects={flow.relatedProjects}
        onCancel={flow.closeDialog}
        onContinue={flow.continueUpdate}
        onDuplicate={flow.openDuplicate}
      />
      <SavedDialog
        plugin={plugin}
        projects={flow.savedProjects ?? []}
        operating={flow.operating}
        onRun={flow.retransform}
        onClose={flow.closeSaved}
      />
    </Cell>
  );
};
