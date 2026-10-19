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
import { Button } from 'antd';
import { useState } from 'react';

import { ListToolbar } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';

const { listToolbar: text } = COPY;

export const ListToolbarDemo = () => {
  const [keyword, setKeyword] = useState('');
  return (
    <DemoSection id={SECTION.LIST_TOOLBAR} title={COPY.sections.listToolbar}>
      <DemoCase label={COPY.cases.startOnly}>
        <ListToolbar list={{ keyword, setKeyword }} searchPlaceholder={text.search} />
      </DemoCase>
      <DemoCase label={COPY.cases.composed}>
        <ListToolbar
          list={{ keyword, setKeyword }}
          searchPlaceholder={text.search}
          filters={<span>{text.filters}</span>}
          end={
            <Button type="primary" icon={<PlusOutlined />}>
              {text.add}
            </Button>
          }
        />
      </DemoCase>
    </DemoSection>
  );
};
