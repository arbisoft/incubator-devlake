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

import { Skeleton } from 'antd';

import API from '@/api';
import { useRefreshData } from '@/hooks';
import { SectionCard, useRefreshVersion } from '@/ui';

import { GrafanaUnavailable, GrafanaUsersCard } from './components';
import { COPY } from './constants';
import { getUnavailableMessage } from './utils';

export const GrafanaUsers = () => {
  const { version, refresh } = useRefreshVersion();
  const status = useRefreshData((signal) => API.grafanaUsers.status(signal), [version]);

  if (status.error === undefined && !status.ready) {
    return (
      <SectionCard title={COPY.title}>
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      </SectionCard>
    );
  }
  if (status.error !== undefined || !status.data?.available) {
    return (
      <SectionCard title={COPY.title}>
        <GrafanaUnavailable message={getUnavailableMessage(status.error ?? status.data)} onRetry={refresh} />
      </SectionCard>
    );
  }
  return <GrafanaUsersCard />;
};
