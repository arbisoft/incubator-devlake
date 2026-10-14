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

import type { LOG_STATUS } from './constants';

export type LogStatus = (typeof LOG_STATUS)[keyof typeof LOG_STATUS];

export type OnboardRecord = {
  plugin: string;
  connectionId: ID;
  blueprintId: ID;
  pipelineId: ID;
  scopeName: string;
};

export type OnboardContextValue = {
  step: number;
  records: OnboardRecord[];
  done: boolean;
  projectName?: string;
  plugin?: string;
  setStep: (value: number) => void;
  setRecords: (value: OnboardRecord[]) => void;
  setProjectName: (value: string) => void;
  setPlugin: (value: string) => void;
};

export type ConnectionDraft = {
  endpoint?: string;
  authMethod?: string;
  usesApiToken?: boolean;
  token?: string;
  username?: string;
  password?: string;
};

export type SyncLogTask = {
  step: number;
  name: string;
  status: LogStatus;
  finishedRecords: number;
};

export type SyncLog = {
  plugin?: string;
  name: string;
  percent: number;
  tasks: SyncLogTask[];
};
