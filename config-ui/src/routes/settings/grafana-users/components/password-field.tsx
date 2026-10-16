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

import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Input, Space, Tooltip } from 'antd';
import { CopyToClipboard } from 'react-copy-to-clipboard';

import { FormField } from '@/ui';

import { COPY } from '../constants';
import { generatePassword } from '../utils';

import type { PasswordFieldProps } from './types';

export const PasswordField = ({ value, disabled, onChange }: PasswordFieldProps) => (
  <FormField label={COPY.password.label} description={COPY.password.rule} required>
    {(control) => (
      <Space.Compact block>
        <Input
          {...control}
          size="large"
          autoComplete="off"
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button size="large" icon={<ReloadOutlined />} disabled={disabled} onClick={() => onChange(generatePassword())}>
          {COPY.password.generate}
        </Button>
        <CopyToClipboard text={value}>
          <Tooltip title={COPY.password.copy}>
            <Button size="large" icon={<CopyOutlined />} aria-label={COPY.password.copy} disabled={value === ''} />
          </Tooltip>
        </CopyToClipboard>
      </Space.Compact>
    )}
  </FormField>
);
