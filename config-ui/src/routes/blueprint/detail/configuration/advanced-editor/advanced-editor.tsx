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

import { CaretDownOutlined, ClearOutlined } from '@ant-design/icons';
import { Button, Dropdown } from 'antd';

import { DOC_URL } from '@/release';
import { ExternalLink } from '@/ui/external-link';

import { COPY, EMPTY_PLAN } from '../constants';
import type { AdvancedEditorProps } from '../types';
import { stringifyPlan } from '../utils';

import { EXAMPLE_CONFIG } from './example';
import { Editor, EditorTitle, Hint, PlanInput, Tools } from './styled';

const PLAN_ROWS = 12;

export const AdvancedEditor = ({ value, onChange }: AdvancedEditorProps) => {
  const copy = COPY.json.editor;

  return (
    <Editor>
      <EditorTitle>{copy.title}</EditorTitle>
      <Hint>
        {copy.hint} <ExternalLink href={DOC_URL.ADVANCED_MODE.EXAMPLES}>{copy.examples}</ExternalLink>
      </Hint>
      <PlanInput
        rows={PLAN_ROWS}
        aria-label={copy.label}
        value={value}
        onChange={({ target }) => onChange(target.value)}
      />
      <Tools>
        <Button size="small" icon={<ClearOutlined />} onClick={() => onChange(stringifyPlan(EMPTY_PLAN))}>
          {copy.reset}
        </Button>
        <Dropdown
          trigger={['click']}
          menu={{
            items: EXAMPLE_CONFIG.map(({ id, name }) => ({ key: id, label: name })),
            onClick: ({ key }) => {
              const config = EXAMPLE_CONFIG.find(({ id }) => id === key)?.config;
              if (config) onChange(stringifyPlan(config));
            },
          }}
        >
          <Button size="small" icon={<CaretDownOutlined />}>
            {copy.templates}
          </Button>
        </Dropdown>
      </Tools>
    </Editor>
  );
};
