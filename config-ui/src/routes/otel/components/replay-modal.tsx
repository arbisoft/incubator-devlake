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

import { HistoryOutlined } from '@ant-design/icons';
import { Alert } from 'antd';
import { useEffect } from 'react';

import API from '@/api';
import type { OtelReplayQueue, OtelReplayRange } from '@/api/otel';
import { ConfirmModal, FormModal, MODAL_WIDTH, useModalForm } from '@/ui';

import { EMPTY_REPLAY_RANGE } from '../replay-constants';
import { Fields } from '../styled';
import type { ReplayModalProps } from '../types';
import {
  formatDayRange,
  getOtelReplayError,
  getReplayDateLimits,
  getReplayQueuedMessage,
  hasReplayRange,
} from '../utils';

import { COPY } from './constants';
import { ReplayRangeField } from './replay-range-field';
import { useConfirmedMutation } from './use-confirmed-mutation';

const resolve = ({ startDate, endDate }: OtelReplayRange) => ({
  config: COPY.replayModal.confirm,
  name: formatDayRange(startDate, endDate),
});

const request = (range: OtelReplayRange) => API.otel.createReplay(range);

const formatSuccess = (_range: OtelReplayRange, queue: OtelReplayQueue) => getReplayQueuedMessage(queue);

export const ReplayModal = ({ open, onClose, onQueued }: ReplayModalProps) => {
  const { values, setField, modalProps } = useModalForm(
    { range: EMPTY_REPLAY_RANGE },
    { onClose, required: [], disabledReason: '' },
  );
  const limits = getReplayDateLimits(new Date());
  const { request: confirm, confirmProps } = useConfirmedMutation({
    resolve,
    request,
    formatError: getOtelReplayError,
    formatSuccess,
    onSuccess: () => {
      modalProps.onCancel();
      onQueued();
    },
  });

  useEffect(() => {
    if (open) setField('range', EMPTY_REPLAY_RANGE);
  }, [open, setField]);

  return (
    <>
      <FormModal
        {...modalProps}
        open={open}
        width={MODAL_WIDTH.MD}
        icon={<HistoryOutlined aria-hidden />}
        title={COPY.replayModal.title}
        submitLabel={COPY.replayModal.submit}
        submitDisabled={!hasReplayRange(values.range)}
        disabledReason={COPY.range.hint(limits.min, limits.max)}
        onSubmit={() => confirm(values.range)}
      >
        <Fields>
          <Alert type="warning" showIcon title={COPY.replayModal.notice} />
          <ReplayRangeField value={values.range} limits={limits} onChange={(range) => setField('range', range)} />
        </Fields>
      </FormModal>
      <ConfirmModal {...confirmProps} />
    </>
  );
};
