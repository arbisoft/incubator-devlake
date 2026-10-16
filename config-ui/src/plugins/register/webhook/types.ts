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

import type { ReactNode } from 'react';

import type { IWebhook } from '@/types';

import type { COMMAND_KEY, WEBHOOK_DIALOG } from './constants';

export type WebhookItemType = {
  id: ID;
  name: string;
};

export type WebhookCommands = Record<(typeof COMMAND_KEY)[keyof typeof COMMAND_KEY], string>;

export type CreateDialogProps = {
  open: boolean;
  onCancel: () => void;
  onSubmitAfter?: (id: ID) => void;
};

export type WebhookDialogProps = {
  open: boolean;
  webhook: IWebhook;
  onCancel: () => void;
  afterClose: () => void;
};

export type WebhookDialogKind = (typeof WEBHOOK_DIALOG)[keyof typeof WEBHOOK_DIALOG];

export type WebHookConnectionProps = {
  filterIds?: ID[];
  extraActions?: ReactNode;
  addDisabledReason?: string;
  onCreateAfter?: (id: ID) => void;
  onDeleteAfter?: (id: ID) => void;
};
