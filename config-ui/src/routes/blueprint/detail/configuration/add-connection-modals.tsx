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

import { PlusOutlined } from '@ant-design/icons';
import { Select } from 'antd';

import { ConnectionModal } from '@/plugins/components/connection-modal';
import { DataScopeSelect } from '@/plugins/components/data-scope-select';
import { PluginName } from '@/plugins/components/plugin-name';
import { MODAL_WIDTH } from '@/ui/constants';
import { FormField } from '@/ui/form-field';
import { FormModal } from '@/ui/form-modal';

import { ADD_CONNECTION_STEP, COPY } from './constants';
import { OptionRow } from './styled';
import type { AddConnectionModalsProps } from './types';

export const AddConnectionModals = ({
  step,
  options,
  selected,
  connection,
  onSelect,
  onNext,
  onCancel,
  onSubmit,
}: AddConnectionModalsProps) => (
  <>
    <FormModal
      open={step === ADD_CONNECTION_STEP.SELECT}
      title={COPY.addConnection.title}
      submitLabel={COPY.addConnection.next}
      width={MODAL_WIDTH.MD}
      submitDisabled={!connection}
      disabledReason={COPY.addConnection.disabledReason}
      onSubmit={onNext}
      onCancel={onCancel}
    >
      <FormField label={COPY.addConnection.label} description={COPY.addConnection.description} required>
        {(control) => (
          <Select
            {...control}
            size="large"
            placeholder={COPY.addConnection.placeholder}
            options={options}
            value={selected}
            optionRender={({ data }) =>
              data.plugin ? (
                <PluginName plugin={data.plugin} name={data.label} />
              ) : (
                <OptionRow>
                  <PlusOutlined aria-hidden />
                  {data.label}
                </OptionRow>
              )
            }
            onChange={onSelect}
          />
        )}
      </FormField>
    </FormModal>
    {connection && (
      <ConnectionModal
        open={step === ADD_CONNECTION_STEP.SCOPES}
        plugin={connection.plugin}
        title={COPY.addConnection.scopesTitle}
        width={MODAL_WIDTH.LG}
        onCancel={onCancel}
      >
        <DataScopeSelect
          plugin={connection.plugin}
          connectionId={connection.id}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      </ConnectionModal>
    )}
  </>
);
