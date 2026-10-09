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

import { useConcurrencyQueue } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { QUEUE_JOB_COUNT, QUEUE_JOB_MS, QUEUE_LIMIT } from './fixtures';
import { Mono } from './styled';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const UseConcurrencyQueueDemo = () => {
  const { enqueue } = useConcurrencyQueue(QUEUE_LIMIT);
  const [running, setRunning] = useState<string[]>([]);
  const [done, setDone] = useState<string[]>([]);
  const text = COPY.useConcurrencyQueue;

  const run = (n: number) => {
    const key = text.job(n);
    void enqueue(key, async () => {
      setRunning((current) => [...current, key]);
      await wait(QUEUE_JOB_MS);
      setRunning((current) => current.filter((item) => item !== key));
      setDone((current) => [...current, key]);
    });
  };

  return (
    <DemoSection id={SECTION.USE_CONCURRENCY_QUEUE} title={COPY.sections.useConcurrencyQueue}>
      <DemoCase label={text.state(running.length, done.length)}>
        <Space wrap>
          <Button type="primary" onClick={() => Array.from({ length: QUEUE_JOB_COUNT }, (_, index) => run(index + 1))}>
            {text.enqueue}
          </Button>
          <Button onClick={() => run(1)}>{text.duplicate}</Button>
        </Space>
        <Mono role="status">{`${running.join(', ')}\n${done.join(', ')}`}</Mono>
      </DemoCase>
    </DemoSection>
  );
};
