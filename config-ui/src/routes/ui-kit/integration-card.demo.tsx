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

import { getPluginConfig } from '@/plugins';
import { IntegrationCard } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { Grid, NarrowCard } from './styled';

const { integrationCard: text } = COPY;

export const IntegrationCardDemo = () => {
  const [last, setLast] = useState<string>(text.none);
  const github = getPluginConfig('github').icon;
  const gitlab = getPluginConfig('gitlab').icon;
  const jira = getPluginConfig('jira').icon;

  return (
    <DemoSection id={SECTION.INTEGRATION_CARD} title={COPY.sections.integrationCard}>
      <DemoCase label={`${COPY.cases.notConnected}, ${COPY.cases.connected}, ${COPY.cases.withFailures}`}>
        <Grid>
          <IntegrationCard
            icon={gitlab}
            name={text.gitlab}
            category={text.category.scm}
            connected={0}
            onAdd={() => setLast(text.added(text.gitlab))}
          />
          <IntegrationCard
            icon={jira}
            name={text.jira}
            category={text.category.issues}
            connected={3}
            onManage={() => setLast(text.managed(text.jira))}
            onAdd={() => setLast(text.added(text.jira))}
          />
          <IntegrationCard
            icon={github}
            name={text.github}
            category={text.category.scm}
            connected={2}
            failed={1}
            onManage={() => setLast(text.managed(text.github))}
            onAdd={() => setLast(text.added(text.github))}
          />
        </Grid>
        <span role="status">{last}</span>
      </DemoCase>
      <DemoCase label={COPY.cases.beta}>
        <NarrowCard>
          <IntegrationCard
            icon={gitlab}
            name={text.gitlab}
            category={text.category.scm}
            beta
            connected={0}
            onAdd={() => undefined}
          />
        </NarrowCard>
      </DemoCase>
      <DemoCase label={COPY.cases.longText}>
        <NarrowCard>
          <IntegrationCard
            icon={github}
            name={text.longName}
            category={text.category.issues}
            beta
            connected={12}
            failed={4}
            onManage={() => undefined}
            onAdd={() => undefined}
          />
        </NarrowCard>
      </DemoCase>
    </DemoSection>
  );
};
