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

import { DeleteOutlined, EditOutlined } from '@ant-design/icons';

import { ICON_BUTTON_TONE, IconButton } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';

const noop = () => undefined;

export const IconButtonDemo = () => (
  <DemoSection id={SECTION.ICON_BUTTON} title={COPY.sections.iconButton}>
    <DemoCase label={COPY.cases.default}>
      <IconButton icon={<EditOutlined />} label={COPY.iconButton.edit} onClick={noop} />
    </DemoCase>
    <DemoCase label={COPY.cases.primary}>
      <IconButton icon={<EditOutlined />} label={COPY.iconButton.edit} tone={ICON_BUTTON_TONE.PRIMARY} onClick={noop} />
    </DemoCase>
    <DemoCase label={COPY.cases.danger}>
      <IconButton
        icon={<DeleteOutlined />}
        label={COPY.iconButton.remove}
        tone={ICON_BUTTON_TONE.DANGER}
        onClick={noop}
      />
    </DemoCase>
    <DemoCase label={COPY.cases.disabled}>
      <IconButton icon={<EditOutlined />} label={COPY.iconButton.edit} disabled onClick={noop} />
    </DemoCase>
    <DemoCase label={COPY.cases.loading}>
      <IconButton icon={<EditOutlined />} label={COPY.iconButton.edit} loading onClick={noop} />
    </DemoCase>
  </DemoSection>
);
