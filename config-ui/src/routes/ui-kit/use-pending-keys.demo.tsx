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
import { Button, Space } from 'antd';
import { useState } from 'react';

import { usePendingKeys } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { PENDING_KEY_ACTION_MS, delay } from './fixtures';

export const UsePendingKeysDemo = () => {
  const { begin, end, isPending } = usePendingKeys();
  const [started, setStarted] = useState<string[]>([]);
  const copy = COPY.usePendingKeys;

  const run = async (key: string) => {
    if (!begin(key)) return;
    setStarted((current) => [...current, key]);
    try {
      await delay(PENDING_KEY_ACTION_MS);
    } finally {
      end(key);
    }
  };

  const pending = copy.keys.filter(isPending);

  return (
    <DemoSection id={SECTION.USE_PENDING_KEYS} title={COPY.sections.usePendingKeys}>
      <DemoCase label={COPY.cases.interactive}>
        <Space wrap>
          {copy.keys.map((key) => (
            <Button key={key} loading={isPending(key)} onClick={() => void run(key)}>
              {copy.run(key)}
            </Button>
          ))}
        </Space>
        <span role="status">{copy.state(pending.join(', ') || copy.none, started.length)}</span>
      </DemoCase>
    </DemoSection>
  );
};
