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

const NAME_LABEL = 'Webhook Name';

export const API_KEY_PLACEHOLDER = '{API_KEY}';

export const WEBHOOK_DIALOG = { ADD: 'add', VIEW: 'view', EDIT: 'edit', DELETE: 'delete' } as const;

export const COLUMN_KEY = { ID: 'id', NAME: 'name', ACTIONS: 'actions' } as const;

export const COMMAND_KEY = {
  POST_ISSUES: 'postIssuesEndpoint',
  CLOSE_ISSUES: 'closeIssuesEndpoint',
  POST_DEPLOYMENTS: 'postDeploymentsCurl',
  POST_PULL_REQUESTS: 'postPullRequestsEndpoint',
} as const;

export const COPY = {
  tableLabel: 'Webhooks',
  columns: { id: 'ID', name: NAME_LABEL },
  add: 'Add a Webhook',
  actions: {
    view: (name: string) => `View ${name}`,
    edit: (name: string) => `Edit ${name}`,
    remove: (name: string) => `Delete ${name}`,
  },
  empty: {
    title: 'No webhooks yet',
    description: 'Add a webhook to push incidents, deployments and pull requests into DevLake.',
  },
  create: {
    title: 'Add a New Webhook',
    nameLabel: NAME_LABEL,
    nameDescription: 'Give your Webhook a unique name to help you identify it in the future.',
    namePlaceholder: NAME_LABEL,
    submit: 'Generate POST URL',
    disabledReason: 'Enter a webhook name to continue.',
    generated: 'CURL commands generated. Please copy them now.',
    keyNotice:
      'A non-expired API key is automatically generated for the authentication of the webhook. This key will only show now. You can revoke it in the webhook page at any time.',
    done: 'Done',
    success: 'Webhook created.',
  },
  edit: {
    title: 'Edit Webhook Name',
    submit: 'Save',
    success: 'Webhook renamed.',
  },
  remove: {
    title: (name: string) => `Delete webhook "${name}"?`,
    description: 'This Webhook cannot be recovered once it’s deleted.',
    confirm: 'Delete',
    success: 'Webhook deleted.',
  },
  view: {
    title: 'Webhook',
    intro: `Copy the following CURL commands to your issue tracking or CI/CD tools to push \`Incidents\` and \`Deployments\` by making a POST to DevLake. Please replace the ${API_KEY_PLACEHOLDER} in the following URLs.`,
    keyTitle: 'API Key',
    copyKey: 'Copy API key',
    keyDescription:
      'If you have forgotten your API key, you can revoke the previous key and generate a new one as a replacement.',
    renew: 'Revoke and generate a new key',
    noExpiration: 'No Expiration',
    keyNotice: 'Please copy your key now. You will not be able to see it again.',
    renewTitle: (name: string) => `Revoke the API key of "${name}" and generate a new one?`,
    renewDescription:
      'Once this action is done, the previous API key will become invalid and you will need to enter the new key in the application that uses this Webhook API.',
    renewConfirm: 'Confirm',
    renewSuccess: 'A new API key was generated.',
  },
  commands: {
    copyFor: (label: string) => `Copy command: ${label}`,
    schema: 'full payload schema',
    seeThe: 'See the',
    titles: { incident: 'Incident', deployments: 'Deployments', pullRequests: 'Pull Requests' },
    labels: {
      [COMMAND_KEY.POST_ISSUES]: 'Post to register/update an incident',
      [COMMAND_KEY.CLOSE_ISSUES]: 'Post to close a registered incident',
      [COMMAND_KEY.POST_DEPLOYMENTS]: 'Post to register a deployment',
      [COMMAND_KEY.POST_PULL_REQUESTS]: 'Post to register/update a pull_request',
    },
  },
  select: {
    title: 'Select Existing Webhooks',
    label: 'Webhooks',
    description: 'Select an existing Webhook to import to the current project.',
    submit: 'Confirm',
  },
};

export const ERROR_MAP: Record<string, string> = {
  '400': 'The webhook was rejected. Check its name and try again.',
  '409': 'A webhook with this name already exists.',
};

export const FALLBACK_ERROR = {
  create: 'Could not create the webhook. Try again.',
  edit: 'Could not rename the webhook. Try again.',
  remove: 'Could not delete the webhook. Try again.',
  renew: 'Could not generate a new API key. Try again.',
};

export const SELECT_COLUMN_HEIGHT = 160;
