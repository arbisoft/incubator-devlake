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

import { COPY } from '../constants';

import { PipelinePanel } from './panel';
import { DetailDialog } from './styled';
import type { PipelineDetailModalProps } from './types';

export const PipelineDetailModal = ({ open, id, onClose, afterClose }: PipelineDetailModalProps) => {
  const { layout } = useTheme();

  return (
    <DetailDialog
      open={open}
      centered
      destroyOnHidden
      footer={null}
      width={layout.modalWidth.lg}
      title={COPY.detail.title(id)}
      onCancel={onClose}
      afterClose={afterClose}
    >
      <PipelinePanel id={id} />
    </DetailDialog>
  );
};
