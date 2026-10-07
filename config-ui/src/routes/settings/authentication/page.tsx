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

import API from '@/api';
import { useRefreshData } from '@/hooks';
import { ListPage, PageHeader, useRefreshVersion } from '@/ui';

import { COPY } from '../constants';

import { Authentication } from './authentication';

export const SettingsAuthentication = () => {
  const { version, refresh } = useRefreshVersion();
  const { data } = useRefreshData(async () => {
    const [providerResult, callbacks] = await Promise.all([
      API.access
        .listOIDCProviders()
        .then((providers) => ({ providers, loadFailed: false }))
        .catch(() => ({ providers: [], loadFailed: true })),
      API.access.getOIDCCallbacks().catch(() => undefined),
    ]);
    return { providerResult, callbacks };
  }, [version]);

  return (
    <ListPage>
      <PageHeader title={COPY.authentication.title} description={COPY.authentication.description} />
      <Authentication
        callbacks={data?.callbacks}
        providers={data?.providerResult.providers ?? []}
        loadFailed={data?.providerResult.loadFailed ?? false}
        onRefresh={refresh}
      />
    </ListPage>
  );
};
