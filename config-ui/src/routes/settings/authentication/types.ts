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

import type { OIDCProvider } from '@/api/access';

import type { PROVIDER_ACTION } from './constants';

export type ProviderAction = (typeof PROVIDER_ACTION)[keyof typeof PROVIDER_ACTION];

export type ProviderOperation = { action: ProviderAction; providerKey: string };

export type ProviderActionsProps = {
  provider: OIDCProvider;
  enabledProviderCount: number;
  isOperating: boolean;
  isActionOperating: (action: ProviderAction, providerKey: string) => boolean;
  onEdit: (provider: OIDCProvider) => void;
  onAction: (action: ProviderAction, provider: OIDCProvider) => void;
};

export type ProviderColumnActions = Omit<ProviderActionsProps, 'provider'>;
