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

import { ProgressBanner } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { Narrow } from './styled';

const { progressBanner: text } = COPY;
const noop = () => undefined;

export const ProgressBannerDemo = () => {
  const [dismissed, setDismissed] = useState(false);
  const [clicked, setClicked] = useState(false);
  const status = [dismissed && text.dismissed, clicked && text.clicked].find(Boolean) || '';

  return (
    <DemoSection id={SECTION.PROGRESS_BANNER} title={COPY.sections.progressBanner}>
      <DemoCase label={COPY.cases.interactive}>
        {dismissed ? (
          <Button onClick={() => setDismissed(false)}>{text.reset}</Button>
        ) : (
          <ProgressBanner
            progress={{ done: 0, total: 3 }}
            message={text.message}
            actionLabel={text.action}
            onAction={() => setClicked(true)}
            onDismiss={() => setDismissed(true)}
          />
        )}
        <span role="status">{status}</span>
      </DemoCase>
      <DemoCase label={COPY.cases.longText}>
        <Narrow>
          <ProgressBanner
            progress={{ done: 2, total: 3 }}
            message={text.longMessage}
            actionLabel={text.action}
            onAction={noop}
            onDismiss={noop}
          />
        </Narrow>
      </DemoCase>
    </DemoSection>
  );
};
