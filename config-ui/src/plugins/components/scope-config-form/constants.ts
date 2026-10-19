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

export const SCOPE_CONFIG_STEP = { DETAILS: 0, TRANSFORMATIONS: 1 } as const;

export const NAME_MAX_LENGTH = 40;

export const SCOPE_CONFIG_META_FIELDS = ['id', 'connectionId', 'name', 'entities', 'createdAt', 'updatedAt'];

export const COPY = {
  steps: { details: 'Scope Config', transformations: 'Transformations' },
  doc: (pluginName: string) => `To learn about how ${pluginName} transformation is used in DevLake,`,
  docLink: 'check out this doc',
  name: {
    label: 'Scope Config Name',
    description: 'Give this Scope Config a unique name so that you can identify it in the future.',
    placeholder: 'My Scope Config 1',
  },
  entities: {
    label: 'Data Entities',
    description: 'Select the data entities you wish to collect for the Data Scope.',
    link: 'Learn about data entities',
  },
  entitiesWarning:
    'Please note: if you edit Data Entities and expect to see the Dashboards updated, you will need to visit the Project page of the Data Scope that has been associated with this Scope Config and click on “Collect All Data”.',
  transformationsWarning:
    'Please note: if you only edit the following Scope Configs without editing Data Entities in the previous step, you will only need to re-transform data on the Project page to see the Dashboard updated.',
  next: 'Next',
  previous: 'Previous',
  save: 'Save',
  cancel: 'Cancel',
  loadFailed: 'Could not load the scope config. Try again.',
  saveFailed: 'Could not save the scope config. Check the fields and try again.',
  duplicate: 'A scope config with this name already exists.',
};

export const SAVE_ERROR_MAP: Record<string, string> = { '409': COPY.duplicate };
