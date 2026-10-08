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

import { useNavigate } from 'react-router-dom';

import { PageLoading } from '@/components';
import { BLUEPRINT_VIEW } from '@/config';

import { ConfigurationPanel } from './configuration-panel';
import { useBlueprintDetail } from './hooks';
import { BlueprintStatus } from './status';
import type { BlueprintDetailProps } from './types';
import { CONTEXT_ROUTES } from './utils';

export const BlueprintDetail = ({ blueprintId, context, view }: BlueprintDetailProps) => {
  const navigate = useNavigate();
  const { detail, version, refresh } = useBlueprintDetail(blueprintId);

  if (!detail) {
    return <PageLoading />;
  }

  const { blueprint, latestPipelineId } = detail;
  const routes = CONTEXT_ROUTES[context];

  return view === BLUEPRINT_VIEW.STATUS ? (
    <BlueprintStatus
      context={context}
      blueprint={blueprint}
      pipelineId={latestPipelineId}
      version={version}
      onRefresh={refresh}
    />
  ) : (
    <ConfigurationPanel
      blueprint={blueprint}
      connectionPath={(plugin, connectionId) => routes.connection(blueprint, plugin, connectionId)}
      onRefresh={refresh}
      onShowStatus={() => navigate(routes.status(blueprint))}
    />
  );
};
