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

import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useId } from 'react';

import { STATUS_TONE } from '@/ui/constants';
import { PluginIcon } from '@/ui/plugin-icon';
import { STATUS_BADGE_VARIANT, StatusBadge } from '@/ui/status-badge';

import { COPY } from './constants';
import { Actions, Category, Counts, Name, Root } from './styled';
import type { IntegrationCardProps } from './types';

export const IntegrationCard = ({
  icon,
  name,
  category,
  beta,
  connected,
  failed,
  onManage,
  onAdd,
}: IntegrationCardProps) => {
  const nameId = useId();
  const isConnected = connected > 0 && onManage !== undefined;

  return (
    <Root $connected={isConnected} aria-labelledby={nameId}>
      <PluginIcon icon={icon} size="lg" />
      <div>
        <Name id={nameId}>{name}</Name>
        <Category>{beta ? COPY.categoryBeta(category) : category}</Category>
      </div>
      {connected > 0 && (
        <Counts>
          <span>{COPY.connected(connected)}</span>
          {failed !== undefined && failed > 0 && (
            <StatusBadge tone={STATUS_TONE.ERROR} label={COPY.failed(failed)} variant={STATUS_BADGE_VARIANT.DOT} />
          )}
        </Counts>
      )}
      <Actions>
        {isConnected ? (
          <>
            <Button block type="primary" aria-describedby={nameId} onClick={onManage}>
              {COPY.manage(connected)}
            </Button>
            <Button block type="text" icon={<PlusOutlined aria-hidden />} aria-describedby={nameId} onClick={onAdd}>
              {COPY.add}
            </Button>
          </>
        ) : (
          <Button block icon={<PlusOutlined aria-hidden />} aria-describedby={nameId} onClick={onAdd}>
            {COPY.add}
          </Button>
        )}
      </Actions>
    </Root>
  );
};
