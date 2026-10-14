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

import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';

import { PATHS } from '@/config/paths';
import { IBPMode } from '@/types';
import { EMPTY_ILLUSTRATION, EMPTY_STATE_SIZE, EmptyState } from '@/ui/empty-state';
import { ICON_BUTTON_TONE, IconButton } from '@/ui/icon-button';
import { KeyValueList } from '@/ui/key-value-list';
import { ROW_LINK_VARIANT, RowLink } from '@/ui/row-link';
import { SectionCard } from '@/ui/section-card';

import { SyncPolicyModal, toPolicyValues, toSummaryItems } from '../../sync-policy';

import { AddConnectionModals } from './add-connection-modals';
import { AdvancedEditor } from './advanced-editor';
import { ConnectionCard } from './connection-card';
import { CONFIG_MODAL, COPY } from './constants';
import { NameModal } from './name-modal';
import { Footer, Grid, NameValue, Stack } from './styled';
import type { ConfigurationProps } from './types';
import { useBlueprintConfiguration } from './use-configuration';

export const BlueprintConfiguration = ({ blueprint, connectionPath, onRefresh, onShowStatus }: ConfigurationProps) => {
  const config = useBlueprintConfiguration({ blueprint, onRefresh, onShowStatus });
  const { addConnection, cards } = config;

  const addButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={addConnection.start}>
      {COPY.connections.add}
    </Button>
  );

  return (
    <Stack>
      <SectionCard
        title={COPY.name.title}
        actions={
          <IconButton
            icon={<EditOutlined />}
            label={COPY.name.edit}
            tone={ICON_BUTTON_TONE.PRIMARY}
            onClick={() => config.openModal(CONFIG_MODAL.NAME)}
          />
        }
      >
        <NameValue>{blueprint.name}</NameValue>
      </SectionCard>
      <SectionCard
        title={COPY.policy.title}
        actions={
          <IconButton
            icon={<EditOutlined />}
            label={COPY.policy.edit}
            tone={ICON_BUTTON_TONE.PRIMARY}
            onClick={() => config.openModal(CONFIG_MODAL.POLICY)}
          />
        }
      >
        <KeyValueList items={toSummaryItems(blueprint)} />
      </SectionCard>
      {blueprint.mode === IBPMode.NORMAL && (
        <SectionCard
          title={COPY.connections.title}
          count={cards.length}
          actions={
            cards.length > 0 && (
              <>
                <Button disabled={!blueprint.enable} loading={config.running} onClick={config.collect}>
                  {COPY.connections.collect}
                </Button>
                {addButton}
              </>
            )
          }
        >
          {cards.length === 0 ? (
            <EmptyState
              size={EMPTY_STATE_SIZE.SECTION}
              illustration={EMPTY_ILLUSTRATION.NO_CONNECTION}
              title={COPY.connections.empty.title}
              description={COPY.connections.empty.description}
              action={
                <>
                  {addButton}
                  <RowLink to={PATHS.CONNECTIONS()} variant={ROW_LINK_VARIANT.LINK}>
                    {COPY.connections.empty.create}
                  </RowLink>
                </>
              }
            />
          ) : (
            <Grid>
              {cards.map(({ key, plugin, connectionId, scopeCount }) => (
                <ConnectionCard
                  key={key}
                  plugin={plugin}
                  connectionId={connectionId}
                  scopeCount={scopeCount}
                  href={connectionPath(plugin, connectionId)}
                />
              ))}
            </Grid>
          )}
        </SectionCard>
      )}
      {blueprint.mode === IBPMode.ADVANCED && (
        <SectionCard title={COPY.json.title}>
          <AdvancedEditor value={config.rawPlan} onChange={config.setRawPlan} />
          <Footer>
            <Button type="primary" loading={config.saving} onClick={config.savePlan}>
              {COPY.json.save}
            </Button>
          </Footer>
        </SectionCard>
      )}
      <NameModal
        open={config.isNameOpen}
        name={blueprint.name}
        loading={config.saving}
        onSubmit={config.saveName}
        onCancel={config.closeModal}
      />
      <SyncPolicyModal
        open={config.isPolicyOpen}
        mode={blueprint.mode}
        values={toPolicyValues(blueprint)}
        loading={config.saving}
        onSubmit={config.savePolicy}
        onCancel={config.closeModal}
      />
      <AddConnectionModals
        step={addConnection.step}
        options={addConnection.options}
        selected={addConnection.selected}
        connection={addConnection.connection}
        onSelect={addConnection.select}
        onNext={addConnection.next}
        onCancel={addConnection.close}
        onSubmit={addConnection.submit}
      />
    </Stack>
  );
};
