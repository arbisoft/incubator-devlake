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

export const SCOPE_CONFIG_DIALOG = {
  ASSOCIATE: 'associate',
  UPDATE: 'update',
  RELATED_PROJECTS: 'relatedProjects',
  DUPLICATE: 'duplicate',
} as const;

export const NO_SCOPE_CONFIG_ID = 'None';
export const TAPD_PLUGIN = 'tapd';

export const COPY = {
  empty: 'N/A',
  associate: 'Associate Scope Config',
  edit: 'Edit Scope Config',
  associateFailed: 'Could not associate the scope config. Try again.',
  checkFailed: 'Could not check the scope config. Try again.',
  retransformFailed: 'Could not start the re-transform. Try again.',
  saved: {
    title: 'Scope Config Saved',
    single: 'Please re-transform data to apply the updated scope config.',
    singleAction: 'Re-transform now',
    multiple: 'The listed projects are impacted. Please re-transform the data to apply the updated scope config.',
    multipleAction: 'Re-transform Data',
    close: 'Close',
  },
  related: {
    title: (scopeConfigName: string | undefined, scopeName: string) => `Edit '${scopeConfigName}' for '${scopeName}'`,
    notice: 'The change will apply to all following projects:',
    cancel: 'Cancel',
    continue: 'Continue',
    duplicate: (scopeName: string) => `Duplicate a scope config for ${scopeName}`,
  },
};
