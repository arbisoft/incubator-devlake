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

import { Alert } from 'antd';

import { CONFIRM_TONE, ConfirmModal } from '@/ui';

import { COPY, DELETE_WARNING } from './constants';
import { Warnings } from './styled';
import type { DeleteProjectModalProps } from './types';

const WARNING_TYPE = { [DELETE_WARNING.OTEL_REMOVED]: 'warning', [DELETE_WARNING.OTEL_FINAL_ACTIVE]: 'error' } as const;

export const DeleteProjectModal = ({ open, name, warnings, loading, onConfirm, onCancel }: DeleteProjectModalProps) => (
  <ConfirmModal
    open={open}
    tone={CONFIRM_TONE.DANGER}
    title={COPY.settings.delete.title(name)}
    description={COPY.settings.delete.description}
    confirmLabel={COPY.settings.delete.confirm}
    loading={loading}
    confirmDisabled={warnings.includes(DELETE_WARNING.OTEL_FINAL_ACTIVE)}
    onConfirm={onConfirm}
    onCancel={onCancel}
  >
    {warnings.length > 0 && (
      <Warnings>
        {warnings.map((warning) => (
          <Alert key={warning} type={WARNING_TYPE[warning]} showIcon title={COPY.settings.delete[warning]} />
        ))}
      </Warnings>
    )}
  </ConfirmModal>
);
