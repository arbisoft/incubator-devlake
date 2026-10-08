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

import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { PATHS } from '@/config';
import { ListPage, PageHeader, RouteTabs, ROUTE_TABS_VARIANT } from '@/ui';

import { COPY as BLUEPRINT_COPY } from '../constants';

import { BlueprintDetail } from './blueprint-detail';
import { BLUEPRINT_CONTEXT } from './constants';
import { useBlueprintView } from './hooks';
import { getAdvancedBlueprintViews } from './utils';

export const BlueprintDetailPage = () => {
  const { id = '' } = useParams();

  const views = useMemo(() => getAdvancedBlueprintViews(id), [id]);
  const view = useBlueprintView(views);

  return (
    <ListPage>
      <PageHeader
        title={BLUEPRINT_COPY.detailTitle(id)}
        breadcrumbs={[
          { label: BLUEPRINT_COPY.breadcrumbAdvanced, path: PATHS.BLUEPRINTS() },
          { label: BLUEPRINT_COPY.breadcrumbBlueprints, path: PATHS.BLUEPRINTS() },
          { label: id },
        ]}
        switcher={<RouteTabs items={views} variant={ROUTE_TABS_VARIANT.SEGMENTED} />}
      />
      <BlueprintDetail blueprintId={id} context={BLUEPRINT_CONTEXT.ADVANCED} view={view} />
    </ListPage>
  );
};
