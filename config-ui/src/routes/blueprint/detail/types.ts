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

import type { BlueprintView } from '@/config';
import type { IBlueprint } from '@/types';

import type { BLUEPRINT_CONTEXT, CONFIRM_KIND } from './constants';

export type BlueprintContext = (typeof BLUEPRINT_CONTEXT)[keyof typeof BLUEPRINT_CONTEXT];
export type ConfirmKind = (typeof CONFIRM_KIND)[keyof typeof CONFIRM_KIND];

export type BlueprintViewPaths = Record<BlueprintView, string>;

export type RunPolicy = { skipCollectors?: boolean; fullSync?: boolean };

export type BlueprintDetailProps = {
  blueprintId: ID;
  context: BlueprintContext;
  view: BlueprintView;
};

export type BlueprintStatusProps = {
  context: BlueprintContext;
  blueprint: IBlueprint;
  pipelineId?: ID;
  version: number;
  onRefresh: () => void;
};

export type StatusActionsProps = {
  context: BlueprintContext;
  blueprint: IBlueprint;
  onRefresh: () => void;
};

export type CollapsiblePanelProps = {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};
