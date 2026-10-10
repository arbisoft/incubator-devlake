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

import type { AiSourcePreference, OtelConnectionResponse, OtelIngestionStatus, OtelProject } from '@/api/otel';

import type { CONNECTION_STATE, LIFECYCLE_ACTION, OTEL_MODAL } from './constants';

export type ConnectionState = (typeof CONNECTION_STATE)[keyof typeof CONNECTION_STATE];
export type LifecycleAction = (typeof LIFECYCLE_ACTION)[keyof typeof LIFECYCLE_ACTION];
export type OtelModal = (typeof OTEL_MODAL)[keyof typeof OTEL_MODAL];

export type PendingOtelAction = { action: LifecycleAction; connection: OtelConnectionResponse };
export type PendingCredentialFocus = { connectionId?: string | number; action?: LifecycleAction };

export type OtelActionCallbacks = {
  onDone: () => void;
  onCredential: (response: OtelConnectionResponse) => void;
};

export interface ProjectSelectFieldProps {
  label: string;
  description?: string;
  value: string[];
  options: { name: string }[];
  onChange: (names: string[]) => void;
}

export type OtelAttentionState = {
  connectionsNeedingAttention: number;
  restartRequired: number;
  recoveryRequired: number;
};

export type ConnectionColumnActions = {
  onManageProjects: (connection: OtelConnectionResponse) => void;
  onAction: (action: LifecycleAction, connection: OtelConnectionResponse) => void;
  onActionButtonRef: (connectionId: string | number, action: LifecycleAction, button: HTMLButtonElement | null) => void;
};

export type ProjectSelectProps = {
  id: string;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  value: string[];
  options: OtelProject[];
  onChange: (names: string[]) => void;
};

export type CreateModalProps = {
  open: boolean;
  presetProject?: string;
  projectOptions: OtelProject[];
  onClose: () => void;
  onCreated: (response: OtelConnectionResponse) => void;
};

export type ProjectsModalProps = {
  open: boolean;
  connection?: OtelConnectionResponse;
  projectOptions: OtelProject[];
  onClose: () => void;
  onSaved: () => void;
};

export type SnippetModalProps = {
  open: boolean;
  credential?: OtelConnectionResponse;
  onClose: () => void;
  onClosed: () => void;
};

export type OtelIngestionHealthProps = {
  loading: boolean;
  failed: boolean;
  status?: OtelIngestionStatus;
  onRetry: () => void;
};

export type OtelSourcePolicyProps = {
  loading: boolean;
  failed: boolean;
  preferences?: AiSourcePreference[];
  onRetry: () => void;
};
