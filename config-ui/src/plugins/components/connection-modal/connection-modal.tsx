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

import { getPluginConfig } from '@/plugins/utils';
import { MODAL_WIDTH, PluginIcon } from '@/ui';

import { COPY } from './constants';
import { Dialog, TitleRow } from './styled';
import type { ConnectionModalProps } from './types';

export const ConnectionModal = ({
  open,
  plugin,
  width = MODAL_WIDTH.MD,
  onCancel,
  afterClose,
  children,
}: ConnectionModalProps) => {
  const { layout } = useTheme();
  const { icon, name } = getPluginConfig(plugin);

  return (
    <Dialog
      open={open}
      centered
      destroyOnHidden
      footer={null}
      width={layout.modalWidth[width]}
      title={
        <TitleRow>
          <PluginIcon icon={icon} size="md" />
          {COPY.title(name)}
        </TitleRow>
      }
      onCancel={onCancel}
      afterClose={afterClose}
    >
      {children}
    </Dialog>
  );
};
