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

import { ReloadOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';

import { STATUS_TONE } from '@/ui/constants';
import { STATUS_BADGE_VARIANT, StatusBadge } from '@/ui/status-badge';
import { formatRelativeTime } from '@/ui/utils';

import { COPY, STATE_LABEL, STATE_TONE } from './constants';
import { Root, TestedAt } from './styled';
import type { ConnectionHealthProps } from './types';

export const ConnectionHealth = ({ state, testedAt, message, testing, onRetest }: ConnectionHealthProps) => {
  const badge = testing ? (
    <StatusBadge tone={STATUS_TONE.INFO} label={COPY.testing} variant={STATUS_BADGE_VARIANT.TEXT} />
  ) : (
    <StatusBadge tone={STATE_TONE[state]} label={STATE_LABEL[state]} variant={STATUS_BADGE_VARIANT.TEXT} />
  );

  return (
    <Root aria-busy={testing}>
      <Tooltip title={testing ? undefined : message}>
        <span tabIndex={message && !testing ? 0 : undefined}>{badge}</span>
      </Tooltip>
      {testedAt !== undefined && !testing && <TestedAt>{COPY.testedAt(formatRelativeTime(testedAt))}</TestedAt>}
      <Tooltip title={COPY.retest}>
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined spin={testing} />}
          aria-label={COPY.retest}
          disabled={testing}
          onClick={onRetest}
        />
      </Tooltip>
    </Root>
  );
};
