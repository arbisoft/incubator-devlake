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

import { useLocation } from 'react-router-dom';

import { AppShell, PageHeader, ProgressBanner, SectionCard } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { DemoSidebar } from './demo-sidebar';
import { NAV_ITEMS } from './nav-fixtures';
import { Box, BoxNarrow, Stack } from './styled';

const { appShell: text } = COPY;

const Shell = ({ initiallyCollapsed }: { initiallyCollapsed: boolean }) => {
  const { pathname } = useLocation();
  return (
    <AppShell
      sidebar={<DemoSidebar items={NAV_ITEMS} activePath={pathname} initiallyCollapsed={initiallyCollapsed} />}
      banner={
        <ProgressBanner
          progress={{ done: 0, total: 3 }}
          message={COPY.progressBanner.message}
          actionLabel={COPY.progressBanner.action}
          onAction={() => undefined}
          onDismiss={() => undefined}
        />
      }
    >
      <Stack>
        <PageHeader title={COPY.pageHeader.title} description={COPY.pageHeader.description} />
        <SectionCard title={COPY.sectionCard.title} count={2}>
          {text.content}
        </SectionCard>
      </Stack>
    </AppShell>
  );
};

export const AppShellDemo = () => (
  <DemoSection id={SECTION.APP_SHELL} title={COPY.sections.appShell}>
    <DemoCase label={`${COPY.cases.boundedBox}. ${text.bannerNote}`}>
      <Box>
        <Shell initiallyCollapsed={false} />
      </Box>
    </DemoCase>
    <DemoCase label={COPY.cases.narrowShell}>
      <BoxNarrow>
        <Shell initiallyCollapsed />
      </BoxNarrow>
    </DemoCase>
  </DemoSection>
);
