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

import { useEffect, useRef, useState } from 'react';

import { CONNECTION_HEALTH_STATE, ConnectionHealth } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { HEALTH_RETEST_MS, HEALTH_TESTED_AT_OFFSET_MS } from './fixtures';
import { Narrow } from './styled';

const { connectionHealth: text } = COPY;
const noop = () => undefined;

const InteractiveHealth = () => {
  const [testing, setTesting] = useState(false);
  const [count, setCount] = useState(0);
  const [testedAt, setTestedAt] = useState(() => Date.now() - HEALTH_TESTED_AT_OFFSET_MS);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const retest = () => {
    setTesting(true);
    setCount((current) => current + 1);
    timer.current = window.setTimeout(() => {
      setTesting(false);
      setTestedAt(Date.now());
    }, HEALTH_RETEST_MS);
  };

  return (
    <>
      <ConnectionHealth
        state={CONNECTION_HEALTH_STATE.ONLINE}
        testedAt={testedAt}
        testing={testing}
        onRetest={retest}
      />
      <span role="status">{text.retests(count)}</span>
    </>
  );
};

export const ConnectionHealthDemo = () => {
  const [testedAt] = useState(() => Date.now() - HEALTH_TESTED_AT_OFFSET_MS);
  return (
    <DemoSection id={SECTION.CONNECTION_HEALTH} title={COPY.sections.connectionHealth}>
      <DemoCase label={COPY.cases.online}>
        <ConnectionHealth state={CONNECTION_HEALTH_STATE.ONLINE} testedAt={testedAt} testing={false} onRetest={noop} />
      </DemoCase>
      <DemoCase label={COPY.cases.offline}>
        <ConnectionHealth
          state={CONNECTION_HEALTH_STATE.OFFLINE}
          testedAt={testedAt}
          message={text.message}
          testing={false}
          onRetest={noop}
        />
      </DemoCase>
      <DemoCase label={COPY.cases.offlineReason}>
        <ConnectionHealth
          state={CONNECTION_HEALTH_STATE.OFFLINE}
          label={text.reason}
          testedAt={testedAt}
          message={text.message}
          testing={false}
          onRetest={noop}
        />
      </DemoCase>
      <DemoCase label={COPY.cases.unknown}>
        <ConnectionHealth state={CONNECTION_HEALTH_STATE.UNKNOWN} testing={false} onRetest={noop} />
      </DemoCase>
      <DemoCase label={COPY.cases.testing}>
        <ConnectionHealth state={CONNECTION_HEALTH_STATE.ONLINE} testedAt={testedAt} testing onRetest={noop} />
      </DemoCase>
      <DemoCase label={COPY.cases.interactive}>
        <InteractiveHealth />
      </DemoCase>
      <DemoCase label={COPY.cases.longText}>
        <Narrow>
          <ConnectionHealth
            state={CONNECTION_HEALTH_STATE.OFFLINE}
            testedAt={testedAt}
            message={text.longMessage}
            testing={false}
            onRetest={noop}
          />
        </Narrow>
      </DemoCase>
    </DemoSection>
  );
};
