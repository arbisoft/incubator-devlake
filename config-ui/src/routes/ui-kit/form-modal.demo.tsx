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

import { ApiOutlined } from '@ant-design/icons';
import { Button, Input, Space } from 'antd';
import { useState } from 'react';

import { FormModal, MODAL_WIDTH, type ModalWidth } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { HEALTH_RETEST_MS } from './fixtures';

const { formModal: text } = COPY;
const TALL_LINES = 40;
const WIDTHS = Object.values(MODAL_WIDTH);

export const FormModalDemo = () => {
  const [width, setWidth] = useState<ModalWidth>();
  const [long, setLong] = useState(false);
  const [single, setSingle] = useState(false);
  const [tall, setTall] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const close = () => {
    setWidth(undefined);
    setLong(false);
    setSingle(false);
    setTall(false);
    setName('');
  };
  const submit = () => {
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      close();
    }, HEALTH_RETEST_MS);
  };

  return (
    <DemoSection id={SECTION.FORM_MODAL} title={COPY.sections.formModal}>
      <DemoCase label={COPY.cases.interactive}>
        <Space wrap>
          {WIDTHS.map((size) => (
            <Button key={size} onClick={() => setWidth(size)}>{`${text.open}: ${size}`}</Button>
          ))}
          <Button onClick={() => setLong(true)}>{`${COPY.cases.longText}: ${text.open}`}</Button>
          <Button onClick={() => setSingle(true)}>{text.openSingle}</Button>
          <Button onClick={() => setTall(true)}>{text.openTall}</Button>
        </Space>
      </DemoCase>
      <FormModal
        open={width !== undefined || long || single || tall}
        title={long ? text.longTitle : text.title}
        icon={<ApiOutlined aria-hidden />}
        submitLabel={text.submit}
        showCancel={!single}
        width={width ?? MODAL_WIDTH.SM}
        loading={loading}
        submitDisabled={name.trim() === ''}
        disabledReason={text.reason}
        onSubmit={submit}
        onCancel={close}
      >
        {tall && Array.from({ length: TALL_LINES }, (_, index) => <p key={index}>{text.tallLine(index + 1)}</p>)}
        <Space orientation="vertical" size="small">
          <label htmlFor="ui-kit-webhook-name">{text.field}</label>
          <Input
            id="ui-kit-webhook-name"
            value={name}
            placeholder={text.hint}
            onChange={(event) => setName(event.target.value)}
          />
        </Space>
      </FormModal>
    </DemoSection>
  );
};
