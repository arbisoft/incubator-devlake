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

import { CopyOutlined } from '@ant-design/icons';
import { Button, Input, Tooltip, message } from 'antd';
import { CopyToClipboard } from 'react-copy-to-clipboard';

import { FormField } from '@/ui';

import { COPY, OIDC_PROVIDER_MESSAGE } from '../constants';

import { CallbackRow } from './styled';
import type { CallbackFieldProps } from './types';

export const CallbackField = ({ label, value }: CallbackFieldProps) => (
  <FormField label={label} description={OIDC_PROVIDER_MESSAGE.CALLBACK_DESCRIPTION}>
    {(control) => (
      <CallbackRow>
        <Input {...control} readOnly value={value || COPY.callback.missing} />
        {value && (
          <CopyToClipboard text={value} onCopy={() => message.success(COPY.callback.copied)}>
            <Tooltip title={COPY.callback.copy(label)}>
              <Button icon={<CopyOutlined />} aria-label={COPY.callback.copy(label)} />
            </Tooltip>
          </CopyToClipboard>
        )}
      </CallbackRow>
    )}
  </FormField>
);
