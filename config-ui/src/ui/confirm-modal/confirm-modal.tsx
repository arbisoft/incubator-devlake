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

import { ExclamationCircleFilled } from '@ant-design/icons';
import { Button } from 'antd';
import { useId } from 'react';
import { useTheme } from 'styled-components';

import { COMMON_COPY } from '@/ui/constants';

import { CONFIRM_TONE } from './constants';
import { Description, Dialog, Footer, Icon, TitleRow } from './styled';
import type { ConfirmModalProps } from './types';

const focusOnMount = (node: HTMLElement | null) => node?.focus();

export const ConfirmModal = ({
  open,
  tone,
  title,
  description,
  confirmLabel,
  cancelLabel = COMMON_COPY.cancel,
  loading,
  onConfirm,
  onCancel,
  afterClose,
}: ConfirmModalProps) => {
  const descriptionId = useId();
  const { layout } = useTheme();
  const danger = tone === CONFIRM_TONE.DANGER;

  return (
    <Dialog
      open={open}
      centered
      width={layout.confirmModalWidth}
      closable={false}
      keyboard={!loading}
      mask={{ closable: !loading }}
      destroyOnHidden
      title={
        <TitleRow>
          <Icon $tone={tone} aria-hidden>
            <ExclamationCircleFilled />
          </Icon>
          {title}
        </TitleRow>
      }
      onCancel={onCancel}
      afterClose={afterClose}
      footer={
        <Footer>
          <Button ref={focusOnMount} disabled={loading} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="primary" danger={danger} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </Footer>
      }
    >
      <Description
        id={descriptionId}
        // antd's dialog has no describedby prop, so the description links itself to its dialog.
        ref={(node) => node?.closest('[role="dialog"]')?.setAttribute('aria-describedby', descriptionId)}
      >
        {description}
      </Description>
    </Dialog>
  );
};
