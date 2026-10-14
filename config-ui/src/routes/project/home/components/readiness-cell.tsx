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

import { COMMON_COPY } from '@/ui';

import { ReadinessMeter } from '../../readiness';
import { PercentLabel, TriggerButton } from '../styled';

import { ReadinessPopover } from './readiness-popover';
import type { ReadinessCellProps } from './types';

const POPOVER_TRIGGERS: ('hover' | 'focus')[] = ['hover', 'focus'];

export const ReadinessCell = ({ readiness }: ReadinessCellProps) => {
  if (!readiness) return COMMON_COPY.emptyValue;
  return (
    <Popover trigger={POPOVER_TRIGGERS} content={<ReadinessPopover readiness={readiness} />}>
      <TriggerButton type="button">
        <ReadinessMeter readiness={readiness} />
        <PercentLabel>{readiness.percentLabel ?? COMMON_COPY.emptyValue}</PercentLabel>
      </TriggerButton>
    </Popover>
  );
};
