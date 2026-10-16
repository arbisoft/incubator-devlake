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

import { message } from 'antd';
import type { McsItem } from 'miller-columns-select';

import API from '@/api';
import { toUserMessage } from '@/ui/utils';

import { COPY, LOAD_ERROR_MAP } from './constants';
import type { ResItem } from './types';

type LoadChildrenOptions = {
  plugin: string;
  connectionId: ID;
  groupId: ID | null;
  pageToken?: string;
  toTitle: (item: ResItem) => string;
};

export type LoadedChildren = { items: McsItem<ResItem>[]; nextPageToken: string; failed: boolean };

export const loadChildren = async ({
  plugin,
  connectionId,
  groupId,
  pageToken,
  toTitle,
}: LoadChildrenOptions): Promise<LoadedChildren> => {
  try {
    const res = await API.scope.remote(plugin, connectionId, { groupId, pageToken });
    const items = (res?.children ?? []).map((it) => ({ ...it, title: toTitle(it) }));
    return { items, nextPageToken: res.nextPageToken, failed: false };
  } catch (err) {
    message.error(toUserMessage(err, LOAD_ERROR_MAP, COPY.loadFailed));
    return { items: [], nextPageToken: '', failed: true };
  }
};
