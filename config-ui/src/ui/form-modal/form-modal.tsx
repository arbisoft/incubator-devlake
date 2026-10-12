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

import { Button, Tooltip } from 'antd';
import { useTheme } from 'styled-components';

import { COMMON_COPY } from '@/ui/constants';

import { Dialog, Footer, SubmitButton, TitleRow } from './styled';
import type { FormModalProps } from './types';

export const FormModal = ({
  open,
  title,
  icon,
  submitLabel,
  cancelLabel = COMMON_COPY.cancel,
  width,
  loading,
  submitDisabled,
  disabledReason,
  onSubmit,
  onCancel,
  children,
}: FormModalProps) => {
  const { layout } = useTheme();
  const reason = submitDisabled ? disabledReason : undefined;

  return (
    <Dialog
      open={open}
      centered
      destroyOnHidden
      width={layout.modalWidth[width]}
      title={
        <TitleRow>
          {icon}
          {title}
        </TitleRow>
      }
      onCancel={onCancel}
      footer={
        <Footer>
          <Tooltip title={reason}>
            <SubmitButton
              type="primary"
              loading={loading}
              aria-disabled={submitDisabled}
              onClick={submitDisabled ? undefined : onSubmit}
            >
              {submitLabel}
            </SubmitButton>
          </Tooltip>
          <Button onClick={onCancel}>{cancelLabel}</Button>
        </Footer>
      }
    >
      {children}
    </Dialog>
  );
};
