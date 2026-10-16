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

import { ApiOutlined, CopyOutlined } from '@ant-design/icons';
import { Button, message, Tooltip } from 'antd';
import { CopyToClipboard } from 'react-copy-to-clipboard';

import { FormModal } from '@/ui';

import { COPY } from '../constants';
import { GeneratedBody, Hint } from '../styled';

import { GeneratedKeyText } from './styled';
import type { GeneratedKeyModalProps } from './types';

export const GeneratedKeyModal = ({ open, apiKey, onClose, onClosed }: GeneratedKeyModalProps) => {
  return (
    <FormModal
      open={open}
      title={COPY.generated.title}
      icon={<ApiOutlined aria-hidden />}
      submitLabel={COPY.generated.done}
      showCancel={false}
      dismissible={false}
      onSubmit={onClose}
      onCancel={onClose}
      afterClose={onClosed}
    >
      <GeneratedBody>
        <Hint>{COPY.generated.description}</Hint>
        <GeneratedKeyText aria-label={COPY.generated.keyLabel} tabIndex={0}>
          {apiKey}
        </GeneratedKeyText>
        <CopyToClipboard
          text={apiKey ?? ''}
          onCopy={(_value, success) => {
            if (success) message.success(COPY.generated.copied);
          }}
        >
          <Tooltip title={COPY.generated.copy}>
            <Button aria-label={COPY.generated.copy} icon={<CopyOutlined />} />
          </Tooltip>
        </CopyToClipboard>
      </GeneratedBody>
    </FormModal>
  );
};
