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

export const FOLLOW_UP = { SCOPES: 'scopes', REMOVAL: 'removal' } as const;

export const COPY = {
  breadcrumbs: {
    projects: 'Projects',
    blueprint: 'Blueprint',
    advanced: 'Advanced',
    blueprints: 'Blueprints',
    configurations: 'Configurations',
    editScope: 'Edit Data Scope',
  },
  title: (connection: string) => `Edit Data Scope — ${connection}`,
  description: {
    prefix: 'To manage the full data scope and scope config for this connection, go to the',
    link: 'connection detail page',
  },
  target: {
    project: (name: string) => `project ${name}`,
    advanced: (name: string) => `blueprint ${name}`,
  },
  manage: { action: 'Manage data scope', title: 'Manage Data Scope' },
  scopes: {
    empty: {
      title: 'No data scopes',
      description: 'This connection has no data scope in this blueprint. Use Manage data scope to add some.',
    },
  },
  remove: {
    action: 'Remove connection',
    title: (connection: string) => `Remove ${connection}?`,
    description: (connection: string, target: string) =>
      `This removes ${connection} and its data scopes from ${target}. Historical data is kept.`,
    confirm: 'Remove connection',
  },
  followUp: {
    title: 'Data Scope Changed',
    description: 'Re-collect the data to get the project metrics updated?',
    confirm: 'Recollect data',
    cancel: 'Later',
  },
  messages: { removed: 'Remove connection successful.' },
  errors: {
    load: 'The connection could not be loaded.',
    update: 'The data scope could not be saved. Try again in a moment.',
    remove: 'The connection could not be removed. Try again in a moment.',
  },
  noBlueprint: {
    title: 'No blueprint',
    description: 'This project has no blueprint, so there is no connection to edit.',
  },
};
