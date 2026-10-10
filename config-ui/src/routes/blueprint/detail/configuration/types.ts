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

import type { IBlueprint, IConnection } from '@/types';

import type { ADD_CONNECTION_STEP, CONFIG_MODAL } from './constants';

export type ConfigModal = (typeof CONFIG_MODAL)[keyof typeof CONFIG_MODAL];
type AddConnectionStep = (typeof ADD_CONNECTION_STEP)[keyof typeof ADD_CONNECTION_STEP];

export type ConfigurationProps = {
  blueprint: IBlueprint;
  connectionPath: (plugin: string, connectionId: ID) => string;
  onRefresh: () => void;
  onShowStatus: () => void;
};

export type ConnectionCardData = { key: string; plugin: string; connectionId: ID; scopeCount: number };

export type ConnectionCardProps = ConnectionCardData & { href: string };

export type ConnectionOption = { value: string; label: string; plugin: string };

export type AddConnectionState = { step: AddConnectionStep; selected?: string };

export type AddConnectionModalsProps = {
  step: AddConnectionStep;
  options: ConnectionOption[];
  selected?: string;
  connection?: IConnection;
  onSelect: (value: string) => void;
  onNext: () => void;
  onCancel: () => void;
  onSubmit: (scopeIds: ID[]) => void;
};

export type NameModalProps = {
  open: boolean;
  name: string;
  loading: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
};

export type AdvancedEditorProps = { value: string; onChange: (value: string) => void };
