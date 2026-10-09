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

export const TEAM_NAME_MAX_LENGTH = 255;

export const COPY = {
  create: {
    title: 'Generate Claude Settings',
    submit: 'Generate',
    disabledReason: 'Enter a team name and select at least one DevLake project.',
    teamName: { label: 'Team name', placeholder: 'Platform Engineering' },
    projects: {
      label: 'DevLake projects',
      placeholder: 'Select one or more projects',
      hint: 'Select at least one DevLake project.',
    },
    teamNotice:
      'The team name and its derived reporting slug cannot be changed later. Project placement controls dashboard visibility; it is not repository attribution.',
  },
  projectsModal: {
    title: 'Manage Claude Code OTel Projects',
    submit: 'Save',
    disabledReason: 'Select at least one DevLake project to save.',
    projectsFor: (name: string) => `DevLake projects for ${name}`,
    note: 'Changing project placement does not generate a credential, rewrite credential storage, restart the Collector, or change existing telemetry.',
    updated: 'Claude Code OTel project placements updated.',
  },
  snippet: {
    title: 'Claude managed settings',
    done: 'Done',
    copy: 'Copy managed settings',
    storageNotice: 'Copy this now. DevLake does not store the generated password or Basic Auth header.',
    replaceNotice: 'Pasting this JSON replaces existing managed env settings, including any console exporter flags.',
    addIn: 'Add this JSON in',
    linkLabel: 'Claude Code managed settings',
    team: 'Team',
    teamSlug: 'Team slug',
    endpoint: 'Endpoint',
  },
};
