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
import { useTheme } from 'styled-components';

import { CODE_LANGUAGE, CodeBlock, MODAL_WIDTH } from '@/ui';

import { COPY } from '../constants';
import { Dialog, DialogTitle, GeneratedBody, Hint } from '../styled';

import type { GeneratedKeyModalProps } from './types';

export const GeneratedKeyModal = ({ open, apiKey, onClose, onClosed }: GeneratedKeyModalProps) => {
  const { layout } = useTheme();

  return (
    <Dialog
      open={open}
      centered
      destroyOnHidden
      footer={null}
      width={layout.modalWidth[MODAL_WIDTH.MD]}
      title={
        <DialogTitle>
          <ApiOutlined aria-hidden />
          {COPY.generated.title}
        </DialogTitle>
      }
      onCancel={onClose}
      afterClose={onClosed}
    >
      <GeneratedBody>
        <Hint>{COPY.generated.description}</Hint>
        <CodeBlock value={apiKey} language={CODE_LANGUAGE.JSON} copyLabel={COPY.generated.copy} />
      </GeneratedBody>
    </Dialog>
  );
};
