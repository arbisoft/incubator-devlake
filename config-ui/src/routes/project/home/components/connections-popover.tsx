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

import { useTheme } from 'styled-components';

import { PluginIcon } from '@/ui';

import { COPY } from '../constants';
import {
  Chip,
  ChipCount,
  Chips,
  PopoverBody,
  PopoverCount,
  PopoverHead,
  PopoverList,
  PopoverRow,
  RowCopy,
  RowSubtitle,
  RowTitle,
} from '../styled';
import { countCategories } from '../utils';

import type { ConnectionsPopoverProps } from './types';

export const ConnectionsPopover = ({ details }: ConnectionsPopoverProps) => {
  const { layout } = useTheme();
  const { connectionsPopover: text } = COPY;
  return (
    <PopoverBody $width={layout.connectionsPopoverWidth}>
      <PopoverHead>
        {text.title}
        <PopoverCount>{details.length}</PopoverCount>
      </PopoverHead>
      <PopoverList>
        {details.map(({ key, name, pluginLabel, category, icon }) => (
          <PopoverRow key={key}>
            <PluginIcon icon={icon} size="sm" />
            <RowCopy>
              <RowTitle title={name}>{name}</RowTitle>
              <RowSubtitle>{text.subtitle(pluginLabel, category)}</RowSubtitle>
            </RowCopy>
          </PopoverRow>
        ))}
      </PopoverList>
      <Chips>
        {countCategories(details).map(({ category, count }) => (
          <Chip key={category}>
            {category}
            <ChipCount>{count}</ChipCount>
          </Chip>
        ))}
      </Chips>
    </PopoverBody>
  );
};
