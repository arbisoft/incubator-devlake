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

import { EllipsisOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { Button, Dropdown, Tooltip } from 'antd';
import { useId } from 'react';

import { COMMON_COPY, STATUS_TONE } from '@/ui/constants';
import { PluginIcon } from '@/ui/plugin-icon';
import { STATUS_BADGE_VARIANT, StatusBadge } from '@/ui/status-badge';

import { COPY } from './constants';
import { Actions, Category, CategoryRow, Counts, Details, Header, HeaderActions, Name, Root } from './styled';
import type { IntegrationCardProps } from './types';

export const IntegrationCard = ({
  icon,
  name,
  category,
  beta,
  deprecated,
  connected,
  failed,
  details,
  menu,
  docsHref,
  onManage,
  onAdd,
}: IntegrationCardProps) => {
  const nameId = useId();
  const isConnected = connected > 0 && onManage !== undefined;

  return (
    <Root $connected={isConnected} aria-labelledby={nameId}>
      <Header>
        <PluginIcon icon={icon} size="lg" />
        {(docsHref || menu) && (
          <HeaderActions>
            {docsHref && (
              <Tooltip title={COPY.docs(name)}>
                <Button
                  type="text"
                  size="small"
                  href={docsHref}
                  target="_blank"
                  rel="noreferrer"
                  icon={<QuestionCircleOutlined />}
                  aria-label={`${COPY.docs(name)} ${COMMON_COPY.opensInNewTab}`}
                />
              </Tooltip>
            )}
            {menu && (
              <Dropdown menu={{ items: menu }} trigger={['click']} placement="bottomRight">
                <Button type="text" size="small" icon={<EllipsisOutlined />} aria-label={COPY.actionsFor(name)} />
              </Dropdown>
            )}
          </HeaderActions>
        )}
      </Header>
      <div>
        <Name id={nameId}>{name}</Name>
        <CategoryRow>
          <Category>{beta ? COPY.categoryBeta(category) : category}</Category>
          {deprecated && (
            <StatusBadge tone={STATUS_TONE.ERROR} label={COPY.deprecated} variant={STATUS_BADGE_VARIANT.TEXT} />
          )}
        </CategoryRow>
      </div>
      {connected > 0 && (
        <Counts>
          <span>{COPY.connected(connected)}</span>
          {failed !== undefined && failed > 0 && (
            <StatusBadge tone={STATUS_TONE.ERROR} label={COPY.failed(failed)} variant={STATUS_BADGE_VARIANT.DOT} />
          )}
        </Counts>
      )}
      {details && <Details>{details}</Details>}
      <Actions>
        {isConnected ? (
          <Button block type="primary" aria-describedby={nameId} onClick={onManage}>
            {COPY.manage(connected)}
          </Button>
        ) : (
          <Button block icon={<PlusOutlined aria-hidden />} aria-describedby={nameId} onClick={onAdd}>
            {COPY.add}
          </Button>
        )}
      </Actions>
    </Root>
  );
};
