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

import { Button, Space } from 'antd';
import { useState } from 'react';

import { CONFIRM_TONE, ConfirmModal } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { HEALTH_RETEST_MS } from './fixtures';

const { confirmModal: text } = COPY;

const CASE = { DEFAULT: 'default', DANGER: 'danger', LOADING: 'loading', LONG: 'long' } as const;
type OpenCase = (typeof CASE)[keyof typeof CASE];

const TITLES: Record<OpenCase, string> = {
  [CASE.DEFAULT]: text.defaultTitle,
  [CASE.DANGER]: text.title,
  [CASE.LOADING]: text.title,
  [CASE.LONG]: text.longTitle,
};

export const ConfirmModalDemo = () => {
  const [open, setOpen] = useState<OpenCase>();
  const [loading, setLoading] = useState(false);
  const close = () => setOpen(undefined);
  const confirm = () => {
    if (open !== CASE.LOADING) return close();
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      close();
    }, HEALTH_RETEST_MS);
  };
  const isDanger = open !== CASE.DEFAULT;

  return (
    <DemoSection id={SECTION.CONFIRM_MODAL} title={COPY.sections.confirmModal}>
      <DemoCase label={COPY.cases.interactive}>
        <Space wrap>
          <Button onClick={() => setOpen(CASE.DEFAULT)}>{`${COPY.cases.default}: ${text.open}`}</Button>
          <Button danger onClick={() => setOpen(CASE.DANGER)}>{`${COPY.cases.danger}: ${text.open}`}</Button>
          <Button onClick={() => setOpen(CASE.LOADING)}>{`${COPY.cases.loading}: ${text.open}`}</Button>
          <Button onClick={() => setOpen(CASE.LONG)}>{`${COPY.cases.longText}: ${text.open}`}</Button>
        </Space>
      </DemoCase>
      <ConfirmModal
        open={open !== undefined}
        tone={isDanger ? CONFIRM_TONE.DANGER : CONFIRM_TONE.DEFAULT}
        title={TITLES[open ?? CASE.DANGER]}
        description={open === CASE.DEFAULT ? text.defaultDescription : text.description}
        confirmLabel={open === CASE.DEFAULT ? text.defaultConfirm : text.confirm}
        cancelLabel={open === CASE.DEFAULT ? text.keep : undefined}
        loading={loading}
        onConfirm={confirm}
        onCancel={close}
      />
    </DemoSection>
  );
};
