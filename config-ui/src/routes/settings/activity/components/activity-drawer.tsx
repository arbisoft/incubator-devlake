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

import { Button } from 'antd';

import { CODE_LANGUAGE, CodeBlock, DetailDrawer, KeyValueList } from '@/ui';

import { COPY } from '../constants';

import { Content, Heading, SectionLabel } from './styled';
import type { ActivityDrawerProps } from './types';

export const ActivityDrawer = ({ open, row, onClose }: ActivityDrawerProps) => (
  <DetailDrawer
    open={open}
    title={COPY.drawer.title}
    onClose={onClose}
    footer={
      <Button type="primary" onClick={onClose}>
        {COPY.drawer.close}
      </Button>
    }
  >
    {row && (
      <Content>
        <Heading>{row.action}</Heading>
        <KeyValueList
          items={[
            { label: COPY.columns.when, value: row.when },
            { label: COPY.columns.actor, value: row.actor },
            { label: COPY.columns.target, value: row.target },
            { label: COPY.columns.detail, value: row.detail },
          ]}
        />
        <section>
          <SectionLabel>{COPY.drawer.output}</SectionLabel>
          <CodeBlock value={row.event} language={CODE_LANGUAGE.JSON} copyLabel={COPY.drawer.copy} />
        </section>
      </Content>
    )}
  </DetailDrawer>
);
