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

import type { IBPMode } from '@/types';

export type SyncPolicyValues = {
  isManual: boolean;
  cronConfig: string;
  skipOnFail: boolean;
  timeAfter: string | null;
};

export type SyncPolicyFormProps = {
  values: SyncPolicyValues;
  showTimeFilter: boolean;
  onChange: (patch: Partial<SyncPolicyValues>) => void;
};

export type SyncPolicyModalProps = {
  open: boolean;
  mode: IBPMode;
  values: SyncPolicyValues;
  loading: boolean;
  onSubmit: (values: SyncPolicyValues) => void;
  onCancel: () => void;
};

export type QuickRange = { key: string; label: string; date: Date };
