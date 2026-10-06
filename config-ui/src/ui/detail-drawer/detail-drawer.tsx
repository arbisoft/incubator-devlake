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

import { Panel, StatusRow } from './styled';
import type { DetailDrawerProps } from './types';

export const DetailDrawer = ({ open, title, status, onClose, footer, children }: DetailDrawerProps) => {
  const { layout } = useTheme();
  return (
    <Panel open={open} size={layout.drawerWidth} title={title} footer={footer} destroyOnHidden onClose={onClose}>
      {status && <StatusRow>{status}</StatusRow>}
      {children}
    </Panel>
  );
};
