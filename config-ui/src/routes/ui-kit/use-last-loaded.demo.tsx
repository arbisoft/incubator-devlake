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

import { Button } from 'antd';
import { useState } from 'react';

import { useLastLoaded } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';

export const UseLastLoadedDemo = () => {
  const [count, setCount] = useState(1);
  const [pending, setPending] = useState(false);
  const [scope, setScope] = useState('a');
  const loaded = pending ? undefined : `value ${count}`;
  const shown = useLastLoaded(loaded, scope);
  const copy = COPY.useLastLoaded;

  return (
    <DemoSection id={SECTION.USE_LAST_LOADED} title={COPY.sections.useLastLoaded}>
      <DemoCase label={COPY.cases.interactive}>
        <Button onClick={() => setCount((value) => value + 1)}>{copy.next}</Button>
        <Button onClick={() => setPending((value) => !value)}>{copy.refetch}</Button>
        <Button onClick={() => setScope((value) => (value === 'a' ? 'b' : 'a'))}>{copy.switchScope}</Button>
        <span role="status">{copy.state(loaded ?? copy.pending, shown ?? copy.pending)}</span>
      </DemoCase>
    </DemoSection>
  );
};
