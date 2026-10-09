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

import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';

import { PATHS } from '@/config';
import { FILTER_TABS_VARIANT, FilterTabs, PageHeader, STATUS_TONE, StatusBadge } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { FILTER_ITEMS_PLAIN } from './fixtures';
import { Narrow } from './styled';

const { pageHeader: text } = COPY;

export const PageHeaderDemo = () => (
  <DemoSection id={SECTION.PAGE_HEADER} title={COPY.sections.pageHeader}>
    <DemoCase label={COPY.cases.default}>
      <PageHeader title={text.title} description={text.description} />
    </DemoCase>
    <DemoCase label={COPY.cases.withBreadcrumbs}>
      <PageHeader
        title={text.crumbs.users}
        breadcrumbs={[{ label: text.crumbs.settings, path: PATHS.UI_KIT() }, { label: text.crumbs.users }]}
        description={text.description}
        actions={
          <Button type="primary" icon={<PlusOutlined />}>
            {text.action}
          </Button>
        }
      />
    </DemoCase>
    <DemoCase label={COPY.cases.withStatus}>
      <PageHeader
        title={text.projectTitle}
        status={<StatusBadge tone={STATUS_TONE.ERROR} label={text.status} variant="text" />}
        description={text.description}
      />
    </DemoCase>
    <DemoCase label={COPY.cases.withSwitcherAndActions}>
      <PageHeader
        title={text.title}
        switcher={
          <FilterTabs
            items={FILTER_ITEMS_PLAIN}
            value={FILTER_ITEMS_PLAIN[0].key}
            onChange={() => undefined}
            variant={FILTER_TABS_VARIANT.PILL}
          />
        }
        actions={<Button>{text.action}</Button>}
      />
    </DemoCase>
    <DemoCase label={COPY.cases.withoutTitle}>
      <PageHeader
        title={text.projectTitle}
        showTitle={false}
        breadcrumbs={[{ label: text.crumbs.settings, path: PATHS.UI_KIT() }, { label: text.projectTitle }]}
      />
    </DemoCase>
    <DemoCase label={COPY.cases.longText}>
      <Narrow>
        <PageHeader
          title={text.longTitle}
          description={text.longDescription}
          actions={<Button>{text.action}</Button>}
        />
      </Narrow>
    </DemoCase>
  </DemoSection>
);
