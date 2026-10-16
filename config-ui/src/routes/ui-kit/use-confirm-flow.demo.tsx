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

import { CONFIRM_TONE, ConfirmModal, useConfirmFlow } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';

const text = COPY.useConfirmFlow;

const CONFIG = {
  tone: CONFIRM_TONE.DANGER,
  title: text.title,
  description: () => text.description,
  confirm: text.confirm,
};

export const UseConfirmFlowDemo = () => {
  const [deleted, setDeleted] = useState(0);
  const { request, confirmProps } = useConfirmFlow<{ confirm: boolean }>({
    resolve: ({ confirm }) => ({ config: confirm ? CONFIG : undefined, name: text.target }),
    run: async () => {
      setDeleted((count) => count + 1);
      return true;
    },
  });

  return (
    <DemoSection id={SECTION.USE_CONFIRM_FLOW} title={COPY.sections.useConfirmFlow}>
      <DemoCase label={COPY.cases.interactive}>
        <Space wrap>
          <Button danger onClick={() => request({ confirm: true })}>
            {text.request}
          </Button>
          <Button onClick={() => request({ confirm: false })}>{text.skip}</Button>
          <span role="status">{text.done(deleted)}</span>
        </Space>
      </DemoCase>
      <ConfirmModal {...confirmProps} />
    </DemoSection>
  );
};
