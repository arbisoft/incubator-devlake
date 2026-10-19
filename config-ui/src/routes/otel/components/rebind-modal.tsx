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

import { SwapOutlined } from '@ant-design/icons';
import { Alert, Checkbox, Input, Typography } from 'antd';
import { useEffect, useEffectEvent, useState } from 'react';

import { OTEL_STATUS, type OtelReplayRange } from '@/api/otel';
import { ConfirmModal, FormField, FormModal, KeyValueList, MODAL_WIDTH, useModalForm } from '@/ui';

import { EMPTY_REPLAY_RANGE } from '../replay-constants';
import { Fields, Hint } from '../styled';
import type { RebindModalProps } from '../types';
import { getRebindDefaults, getReplayDateLimits, hasReplayRange, isOrganizationId } from '../utils';

import { COPY } from './constants';
import { ReplayRangeField } from './replay-range-field';
import { useRebindConfirm } from './use-rebind-confirm';

const INITIAL_FORM: { organizationId: string; rebuild: boolean; range: OtelReplayRange } = {
  organizationId: '',
  rebuild: false,
  range: EMPTY_REPLAY_RANGE,
};

export const RebindModal = ({ open, connection, onClose, onRebound }: RebindModalProps) => {
  const [slug, setSlug] = useState('');
  const { values, setField, reset, modalProps } = useModalForm(INITIAL_FORM, {
    onClose,
    required: ['organizationId'],
    disabledReason: COPY.rebind.invalid,
  });
  const { request, confirmProps } = useRebindConfirm({
    onRebound: () => {
      reset();
      onRebound();
    },
  });
  const target = connection?.connection;

  const targetId = target?.id;

  const applyDefaults = useEffectEvent(() => {
    if (!target) return;
    const { rebuild, range } = getRebindDefaults(target, new Date());
    setField('rebuild', rebuild);
    setField('range', range);
  });

  useEffect(() => {
    if (open && targetId !== undefined) applyDefaults();
  }, [open, targetId]);

  const now = new Date();
  const limits = getReplayDateLimits(now, target?.createdAt);
  const available = target ? getRebindDefaults(target, now).available : false;
  const organizationId = values.organizationId.trim();
  const same = organizationId.toLowerCase() === (target?.organizationId ?? '').toLowerCase();
  const rangeMissing = values.rebuild && !hasReplayRange(values.range);
  const invalid = !isOrganizationId(organizationId);
  const disabledReason = [
    { blocked: invalid, reason: COPY.rebind.invalid },
    { blocked: same, reason: COPY.rebind.same },
    { blocked: rangeMissing, reason: COPY.range.hint(limits.min, limits.max) },
  ].find(({ blocked }) => blocked)?.reason;

  const submit = () => {
    if (connection) {
      request({ connection, payload: { organizationId, replay: values.rebuild ? values.range : undefined } });
    }
  };

  return (
    <>
      <FormModal
        {...modalProps}
        open={open}
        width={MODAL_WIDTH.MD}
        icon={<SwapOutlined aria-hidden />}
        title={COPY.rebind.title}
        submitLabel={COPY.rebind.submit}
        submitDisabled={disabledReason !== undefined}
        disabledReason={disabledReason}
        onSubmit={submit}
      >
        <Fields>
          <KeyValueList
            items={[
              { label: COPY.rebind.team, value: target?.teamName },
              {
                label: COPY.rebind.current,
                value: target?.organizationId ? (
                  <Typography.Text code>{target.organizationId}</Typography.Text>
                ) : (
                  COPY.rebind.notBound
                ),
              },
            ]}
          />
          <FormField label={COPY.rebind.field.label} description={COPY.rebind.field.hint} required>
            {(control) => (
              <Input
                {...control}
                placeholder={COPY.rebind.field.placeholder}
                value={values.organizationId}
                onChange={(event) => setField('organizationId', event.target.value)}
              />
            )}
          </FormField>
          <Alert
            type="warning"
            showIcon
            title={target?.status === OTEL_STATUS.REVOKED ? COPY.rebind.revoked : COPY.rebind.acceptOnly}
            description={COPY.rebind.wrongId}
          />
          <Checkbox
            checked={values.rebuild}
            disabled={!available}
            onChange={(event) => setField('rebuild', event.target.checked)}
          >
            {COPY.rebind.rebuild}
          </Checkbox>
          {!available && <Hint>{COPY.rebind.unavailable}</Hint>}
          {values.rebuild && (
            <>
              <ReplayRangeField value={values.range} limits={limits} onChange={(range) => setField('range', range)} />
              <Hint>{COPY.rebind.rebuildHint}</Hint>
              {target?.organizationId && <Hint>{COPY.rebind.previousOrg}</Hint>}
            </>
          )}
        </Fields>
      </FormModal>
      <ConfirmModal {...confirmProps} confirmDisabled={slug !== target?.teamSlug} afterClose={() => setSlug('')}>
        <KeyValueList
          items={[
            { label: COPY.rebind.current, value: target?.organizationId ?? COPY.rebind.notBound },
            { label: COPY.rebind.next, value: organizationId },
          ]}
        />
        <FormField label={COPY.rebind.confirm.slug(target?.teamSlug ?? '')}>
          {(control) => <Input {...control} value={slug} onChange={(event) => setSlug(event.target.value)} />}
        </FormField>
      </ConfirmModal>
    </>
  );
};
