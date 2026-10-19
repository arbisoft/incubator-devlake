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

import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useId, useState } from 'react';

import { COPY } from './constants';
import { Panel, PanelActions, PanelBody, PanelHead, PanelTitle } from './styled';
import type { CollapsiblePanelProps } from './types';

export const CollapsiblePanel = ({ title, actions, children }: CollapsiblePanelProps) => {
  const [expanded, setExpanded] = useState(true);
  const bodyId = useId();
  const toggleLabel = COPY.panels.toggle(title, expanded);

  return (
    <Panel aria-label={title}>
      <PanelHead>
        <PanelTitle>{title}</PanelTitle>
        <Tooltip title={toggleLabel}>
          <Button
            icon={expanded ? <DownOutlined /> : <UpOutlined />}
            aria-label={toggleLabel}
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded((open) => !open)}
          />
        </Tooltip>
      </PanelHead>
      <PanelBody id={bodyId} hidden={!expanded}>
        {actions && <PanelActions>{actions}</PanelActions>}
        {children}
      </PanelBody>
    </Panel>
  );
};
