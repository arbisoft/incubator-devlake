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

import { CodeBlock, DetailDrawer, KeyValueList, STATUS_TONE, StatusBadge } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { JSON_LONG_SAMPLE, KEY_VALUE_ITEMS } from './fixtures';

const { detailDrawer: text } = COPY;

const CASE = { DEFAULT: 'default', LONG: 'long' } as const;
type OpenCase = (typeof CASE)[keyof typeof CASE];

export const DetailDrawerDemo = () => {
  const [open, setOpen] = useState<OpenCase>();
  const close = () => setOpen(undefined);

  return (
    <DemoSection id={SECTION.DETAIL_DRAWER} title={COPY.sections.detailDrawer}>
      <DemoCase label={COPY.cases.interactive}>
        <Space wrap>
          <Button onClick={() => setOpen(CASE.DEFAULT)}>{text.open}</Button>
          <Button onClick={() => setOpen(CASE.LONG)}>{`${COPY.cases.longText}: ${text.open}`}</Button>
        </Space>
      </DemoCase>
      <DetailDrawer
        open={open !== undefined}
        title={open === CASE.LONG ? text.longTitle : text.title}
        status={<StatusBadge tone={STATUS_TONE.ERROR} label={text.status} variant="dot" />}
        onClose={close}
        footer={
          <Space>
            <Button type="primary" onClick={close}>
              {text.close}
            </Button>
            <Button>{text.copy}</Button>
          </Space>
        }
      >
        <KeyValueList items={KEY_VALUE_ITEMS} />
        <CodeBlock
          value={JSON.stringify(open === CASE.LONG ? JSON_LONG_SAMPLE : KEY_VALUE_ITEMS, null, 2)}
          language="json"
          copyLabel={text.copy}
        />
      </DetailDrawer>
    </DemoSection>
  );
};
