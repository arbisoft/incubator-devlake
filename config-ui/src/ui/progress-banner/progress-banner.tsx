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

import {
  CheckCircleFilled,
  CloseCircleFilled,
  CloseOutlined,
  ExclamationCircleFilled,
  InfoCircleFilled,
  LoadingOutlined,
} from '@ant-design/icons';
import { Button, Tooltip } from 'antd';

import { STATUS_TONE } from '@/ui/constants';
import type { StatusTone } from '@/ui/types';

import { COPY } from './constants';
import { Copy, Indicator, Message, Progress, Root, Title } from './styled';
import type { ProgressBannerProps } from './types';

const TONE_ICON: Record<StatusTone, typeof InfoCircleFilled | undefined> = {
  [STATUS_TONE.SUCCESS]: CheckCircleFilled,
  [STATUS_TONE.WARNING]: ExclamationCircleFilled,
  [STATUS_TONE.ERROR]: CloseCircleFilled,
  [STATUS_TONE.INFO]: InfoCircleFilled,
  [STATUS_TONE.NEUTRAL]: undefined,
};

export const ProgressBanner = ({
  progress,
  tone = STATUS_TONE.NEUTRAL,
  loading,
  title,
  message,
  actionLabel,
  onAction,
  secondaryAction,
  onDismiss,
}: ProgressBannerProps) => {
  const ToneIcon = TONE_ICON[tone];

  return (
    <Root role="region" aria-label={title ?? message}>
      {progress && <Progress>{COPY.progress(progress.done, progress.total)}</Progress>}
      {!progress && loading && (
        <Indicator $tone={tone}>
          <LoadingOutlined aria-hidden />
        </Indicator>
      )}
      {!progress && !loading && ToneIcon && (
        <Indicator $tone={tone}>
          <ToneIcon aria-hidden />
        </Indicator>
      )}
      <Copy>
        {title && <Title>{title}</Title>}
        <Message>{message}</Message>
      </Copy>
      <Button type="text" onClick={onAction}>
        {actionLabel}
      </Button>
      {secondaryAction && (
        <Button type="text" onClick={secondaryAction.onClick}>
          {secondaryAction.label}
        </Button>
      )}
      <Tooltip title={COPY.dismiss}>
        <Button type="text" icon={<CloseOutlined />} aria-label={COPY.dismiss} onClick={onDismiss} />
      </Tooltip>
    </Root>
  );
};
