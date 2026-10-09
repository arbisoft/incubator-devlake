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

import { pickDeprecatedPlugin, readDismissedNotices, writeDismissedNotice, type DismissedNotices } from './utils';

export const useDeprecationNotice = (plugins: string[], connections: Array<{ plugin: string }>) => {
  const [sessionDismissed, setSessionDismissed] = useState<DismissedNotices>({});

  const notice = pickDeprecatedPlugin(
    plugins.map((plugin) => getPluginConfig(plugin)),
    connections,
    { ...readDismissedNotices(plugins), ...sessionDismissed },
  );

  const dismiss = () => {
    if (!notice?.deprecationMessage) return;
    setSessionDismissed((prev) => ({ ...prev, [notice.plugin]: notice.deprecationMessage }));
    writeDismissedNotice(notice.plugin, notice.deprecationMessage);
  };

  return { notice, dismiss };
};
