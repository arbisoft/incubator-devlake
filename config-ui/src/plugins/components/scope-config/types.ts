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

import type { SCOPE_CONFIG_DIALOG } from './constants';

export type ScopeConfigDialog = (typeof SCOPE_CONFIG_DIALOG)[keyof typeof SCOPE_CONFIG_DIALOG];

export type ProjectRef = { name: string; blueprintId: ID };

export type RelatedProject = { name: string; scopes: Array<{ scopeName: string }> };

export type ScopeConfigProps = {
  plugin: string;
  connectionId: ID;
  scopeId: ID;
  scopeName: string;
  scopeConfigId?: ID;
  scopeConfigName?: string;
  onSuccess: (id?: ID) => void;
};

export type SavedDialogProps = {
  plugin: string;
  projects: ProjectRef[];
  operating: boolean;
  onRun: (project: ProjectRef) => void;
  onClose: () => void;
};

export type RelatedProjectsDialogProps = {
  open: boolean;
  plugin: string;
  title: string;
  scopeName: string;
  projects: RelatedProject[];
  onCancel: () => void;
  onContinue: () => void;
  onDuplicate: () => void;
};
