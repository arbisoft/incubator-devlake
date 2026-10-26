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

import type { IWebhookAPI, WebhookPayload } from '@/types';

import * as connection from '../../connection';

export const list = (): Promise<IWebhookAPI[]> => connection.list<IWebhookAPI>('webhook');

export const get = (id: ID): Promise<IWebhookAPI> => connection.get<IWebhookAPI>('webhook', id);

export const create = (payload: WebhookPayload): Promise<IWebhookAPI> =>
  connection.create<IWebhookAPI, WebhookPayload>('webhook', payload);

export const remove = (id: ID) => connection.remove('webhook', id);

export const update = (id: ID, payload: WebhookPayload) => connection.update<WebhookPayload>('webhook', id, payload);
