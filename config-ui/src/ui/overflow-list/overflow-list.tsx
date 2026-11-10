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

import { ListPopover, ListPopoverRow } from '@/ui/list-popover';

import { OVERFLOW_LAYOUT } from './constants';
import { List, MoreButton } from './styled';
import type { OverflowListProps } from './types';
import { splitOverflow } from './utils';

const POPOVER_TRIGGERS: ('hover' | 'focus' | 'click')[] = ['hover', 'focus', 'click'];

export const OverflowList = ({
  items,
  title,
  max,
  moreLabel,
  layout = OVERFLOW_LAYOUT.STACK,
  listRef,
  footer,
}: OverflowListProps) => {
  const { visible, hidden } = splitOverflow(items, max);

  return (
    <List ref={listRef} $layout={layout}>
      {visible.map(({ key, node }) => (
        <li key={key}>{node}</li>
      ))}
      {hidden.length > 0 && (
        <li>
          <Popover
            trigger={POPOVER_TRIGGERS}
            content={
              <ListPopover title={title} count={items.length} footer={footer}>
                {items.map(({ key, node }) => (
                  <ListPopoverRow key={key}>{node}</ListPopoverRow>
                ))}
              </ListPopover>
            }
          >
            <MoreButton type="button" $layout={layout}>
              {moreLabel(hidden.length)}
            </MoreButton>
          </Popover>
        </li>
      )}
    </List>
  );
};
