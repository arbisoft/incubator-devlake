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

import type { ProjectTab } from '@/config';
import type { IProject } from '@/types';
import type { RouteTab } from '@/ui/types';

import type { DELETE_WARNING } from './constants';

export type ProjectRouteTab = RouteTab & { key: ProjectTab };

export type DeleteWarning = (typeof DELETE_WARNING)[keyof typeof DELETE_WARNING];

export type OtelPlacementState = { hasPlacements: boolean; hasActiveFinal: boolean };

export type SettingsForm = {
  name: string;
  dora: boolean;
  linker: boolean;
  linkerRegexp: string;
  issueTrace: boolean;
};

export type ProjectPayload = Pick<IProject, 'name' | 'description' | 'metrics'>;

export type ProjectPanelProps = { project: IProject; onRefresh: () => void };

export type SettingOptionProps = {
  label: string;
  description: string;
  checked: boolean;
  aside?: ReactNode;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
};

export type DeleteProjectModalProps = {
  open: boolean;
  name: string;
  warnings: DeleteWarning[];
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export type ClaudeCodeOtelPanelProps = { projectName: string };
