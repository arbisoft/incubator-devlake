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

import { COMMON_COPY, MODAL_WIDTH } from '@/ui/constants';

import { Dialog, Footer, SubmitButton, TitleIcon, TitleRow } from './styled';
import type { FormModalProps } from './types';

export const FormModal = ({
  open,
  title,
  icon,
  submitLabel,
  cancelLabel = COMMON_COPY.cancel,
  showCancel = true,
  dismissible = true,
  width = MODAL_WIDTH.MD,
  loading,
  submitDisabled,
  disabledReason,
  onSubmit,
  onCancel,
  afterClose,
  children,
}: FormModalProps) => {
  const { layout } = useTheme();
  const reason = submitDisabled ? disabledReason : undefined;
  const canDismiss = dismissible && !loading;
  const cancel = () => {
    if (canDismiss) onCancel();
  };
  const submit = () => {
    if (!loading && !submitDisabled) onSubmit();
  };

  return (
    <Dialog
      open={open}
      centered
      destroyOnHidden
      closable={canDismiss}
      keyboard={canDismiss}
      mask={{ closable: canDismiss }}
      width={layout.modalWidth[width]}
      title={
        <TitleRow>
          {icon && <TitleIcon>{icon}</TitleIcon>}
          {title}
        </TitleRow>
      }
      onCancel={cancel}
      afterClose={afterClose}
      footer={
        <Footer>
          <Tooltip title={reason}>
            <SubmitButton
              type="primary"
              loading={loading}
              aria-disabled={submitDisabled}
              onClick={loading || submitDisabled ? undefined : submit}
            >
              {submitLabel}
            </SubmitButton>
          </Tooltip>
          {showCancel && (
            <Button disabled={!canDismiss} onClick={cancel}>
              {cancelLabel}
            </Button>
          )}
        </Footer>
      }
    >
      {children}
    </Dialog>
  );
};
