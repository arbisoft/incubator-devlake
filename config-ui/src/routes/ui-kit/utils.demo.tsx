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

import { useState } from 'react';

import { formatDateTime, formatRelativeTime, toUserMessage } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { ERROR_CASES, RELATIVE_OFFSETS_MS } from './fixtures';
import { Mono } from './styled';

const ERROR_MAP = { '409': COPY.utils.conflict };

export const UtilsDemo = () => {
  const [now] = useState(Date.now);
  return (
    <DemoSection id={SECTION.UTILS} title={COPY.sections.utils}>
      <DemoCase label={COPY.utils.toUserMessage}>
        <Mono>{`${COPY.utils.mapped}: ${toUserMessage(ERROR_CASES.conflict, ERROR_MAP)}`}</Mono>
        <Mono>{`${COPY.utils.unmapped}: ${toUserMessage(ERROR_CASES.unmapped, ERROR_MAP)}`}</Mono>
      </DemoCase>
      <DemoCase label={COPY.utils.formatRelativeTime}>
        {RELATIVE_OFFSETS_MS.map((offset) => (
          <Mono key={offset}>{formatRelativeTime(now - offset, now)}</Mono>
        ))}
      </DemoCase>
      <DemoCase label={COPY.utils.formatDateTime}>
        <Mono>{formatDateTime(now)}</Mono>
        <Mono>{formatDateTime(null)}</Mono>
      </DemoCase>
    </DemoSection>
  );
};
