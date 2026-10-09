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

export const CONFIG_MODAL = { NAME: 'name', POLICY: 'policy' } as const;

export const ADD_CONNECTION_STEP = { CLOSED: 'closed', SELECT: 'select', SCOPES: 'scopes' } as const;

export const NEW_CONNECTION_VALUE = '';
export const PLAN_INDENT = '  ';
export const EMPTY_PLAN = [[]];

export const COPY = {
  name: {
    title: 'Blueprint name',
    edit: 'Edit blueprint name',
    modalTitle: 'Change blueprint name',
    label: 'Blueprint name',
    description: 'Give your Blueprint a unique name to help you identify it in the future.',
    submit: 'Save',
    disabledReason: 'Enter a new name first.',
  },
  policy: { title: 'Sync policy', edit: 'Edit sync policy' },
  connections: {
    title: 'Data connections',
    add: 'Add connection',
    collect: 'Collect data',
    scopeCount: (count: number) => `${count} data scope`,
    editScope: 'Edit data scope and scope config',
    unknownName: (plugin: string, connectionId: string | number) => `${plugin}/connection/${connectionId}`,
    empty: {
      title: 'No data connection',
      description:
        'Add an existing connection to this blueprint. If you have not created data connections yet, create one first.',
      create: 'Create connections',
    },
  },
  addConnection: {
    title: 'Add connection',
    scopesTitle: 'Add connection: select data scopes',
    label: 'Data connection',
    description: 'Choose an existing connection, or create a new one.',
    placeholder: 'Select a connection',
    createNew: 'Add new connection',
    next: 'Next',
    disabledReason: 'Select a connection first.',
  },
  json: {
    title: 'JSON configuration',
    save: 'Save',
    editor: {
      title: 'Task editor',
      hint: 'Enter JSON configuration or preload from a template.',
      examples: 'See examples',
      reset: 'Reset',
      templates: 'Load templates',
      label: 'Blueprint JSON configuration',
    },
  },
};
