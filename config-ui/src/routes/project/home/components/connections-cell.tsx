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

import { Popover } from 'antd';

import { PluginIcon, splitOverflow } from '@/ui';

import { COPY, MAX_VISIBLE_CONNECTIONS } from '../constants';
import { IconLabel, IconRow, MoreCount, TriggerButton } from '../styled';
import { useConnectionDetails } from '../use-connection-details';

import { ConnectionsPopover } from './connections-popover';
import type { ConnectionsCellProps } from './types';

const POPOVER_TRIGGERS: ('hover' | 'focus')[] = ['hover', 'focus'];

export const ConnectionsCell = ({ entries, buttonRef }: ConnectionsCellProps) => {
  const details = useConnectionDetails(entries);
  const { visible, hidden } = splitOverflow(details, MAX_VISIBLE_CONNECTIONS);
  return (
    <Popover trigger={POPOVER_TRIGGERS} content={<ConnectionsPopover details={details} />}>
      <TriggerButton type="button" ref={buttonRef} aria-label={COPY.connectionsLabel(details.map(({ name }) => name))}>
        <IconRow aria-hidden>
          {visible.map(({ key, icon }) => (
            <IconLabel key={key}>
              <PluginIcon icon={icon} size="sm" />
            </IconLabel>
          ))}
          {hidden.length > 0 && <MoreCount>{COPY.moreConnections(hidden.length)}</MoreCount>}
        </IconRow>
      </TriggerButton>
    </Popover>
  );
};
