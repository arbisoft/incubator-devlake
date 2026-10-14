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

export const ONBOARD_PLUGIN = {
  GITHUB: 'github',
  GITLAB: 'gitlab',
  BITBUCKET: 'bitbucket',
  AZURE_DEVOPS: 'azuredevops',
  ASANA: 'asana',
} as const;

export const WIZARD_STEP = { WELCOME: 0, PROJECT: 1, CONNECTION: 2, SCOPE: 3, RESULT: 4 } as const;

export const LOG_STATUS = { PENDING: 'pending', RUNNING: 'running', SUCCESS: 'success', FAILED: 'failed' } as const;

export const CLONE_REPO_TASK = 'Clone Git Repo';

export const GUIDE_ROOT = '/onboard';
export const DEFAULT_GUIDE = 'default';
export const GUIDE_STEP = { PROJECT: 'step-1', CONNECTION: 'step-2', SCOPE: 'step-3' } as const;

export const CONNECTION_DEFAULTS = {
  [ONBOARD_PLUGIN.GITHUB]: { authMethod: 'AccessToken', endpoint: 'https://api.github.com/' },
  [ONBOARD_PLUGIN.GITLAB]: { endpoint: 'https://gitlab.com/api/v4/' },
  [ONBOARD_PLUGIN.BITBUCKET]: { endpoint: 'https://api.bitbucket.org/2.0/', usesApiToken: true },
  [ONBOARD_PLUGIN.AZURE_DEVOPS]: {},
} as const;

export const PLATFORM_NAME: Record<string, string> = {
  [ONBOARD_PLUGIN.GITHUB]: 'GitHub',
  [ONBOARD_PLUGIN.GITLAB]: 'GitLab',
  [ONBOARD_PLUGIN.AZURE_DEVOPS]: 'Azure DevOps',
};

export const CONNECTION_OPTIONS = [
  { plugin: ONBOARD_PLUGIN.GITHUB, value: ONBOARD_PLUGIN.GITHUB, label: 'GitHub' },
  { plugin: ONBOARD_PLUGIN.GITLAB, value: ONBOARD_PLUGIN.GITLAB, label: 'GitLab' },
  { plugin: ONBOARD_PLUGIN.BITBUCKET, value: ONBOARD_PLUGIN.BITBUCKET, label: 'Bitbucket' },
  { plugin: ONBOARD_PLUGIN.AZURE_DEVOPS, value: ONBOARD_PLUGIN.AZURE_DEVOPS, label: 'Azure DevOps' },
];

export const COPY = {
  title: 'Onboard',
  welcome: 'Welcome to',
  defaultProduct: 'DevLake',
  subtitle: 'With just a few clicks, you can integrate your initial DevOps tool and observe engineering metrics.',
  start: 'Connect to your first repository',
  heading: 'Connect to your first repository',
  exit: 'Exit onboarding',
  exitConfirm: {
    title: 'Are you sure to exit the onboarding session?',
    description: 'You can get back to this session via the card on top of the Projects page.',
    confirm: 'Confirm',
  },
  steps: [
    { step: 1, title: 'Create Project' },
    { step: 2, title: 'Configure Connection' },
    { step: 3, title: 'Add data scope' },
  ],
  previous: 'Previous Step',
  next: 'Next Step',
  dataConnections: 'Data Connections',
  project: {
    name: 'Project Name',
    nameDescription: 'Give your project a unique name with letters, numbers, -, _ or /',
    namePlaceholder: 'Your Project Name',
    nameTaken: (name: string) => `Project name "${name}" already exists, please try another name.`,
    connection: 'Data Connection',
    connectionDescription: 'For self-managed GitLab/GitHub/Bitbucket, please skip the onboarding and configure via',
    connectionPlaceholder: 'Select a Data Connection',
  },
  connection: {
    tokenLabel: 'Personal Access Token',
    tokenDescription: (platform: string, plugin: string) =>
      `Create a personal access token in ${platform}. For self-managed ${plugin}, please skip the onboarding and configure via`,
    testTooltip: 'Test Connection',
    connect: 'Connect',
    connectSuccess: 'Connection success.',
    connectFailed: 'Connection failed. Please check your token or network.',
  },
  scope: {
    congratulations: 'Congratulations！You have successfully connected to your first repository!',
  },
  result: {
    syncing: (scope: string) => `Syncing up data from ${scope}...`,
    collected: (scope: string) => `${scope} is successfully collected !`,
    partial: (scope: string) => `Data from ${scope} has been partially collected!`,
    failed: 'Something went wrong with the collection process.',
    failedHint:
      "Please verify your network connection and ensure your token's rate limits have not been exceeded, then attempt to collect the data again. Alternatively, you may report the issue by filing a bug on",
    github: 'GitHub',
    syncTip: {
      [ONBOARD_PLUGIN.GITHUB]:
        'This may take a few minutes to hours, depending on the volume of your data and the rate limits imposed by GitHub. DevLake collects all available GitHub history by default unless you configure a start date.',
      other:
        'This may take a few minutes to hours, depending on the volume of your data and the rate limits imposed by the selected tool. To speed up, only data updated from the past 14 days will be collected. However, this timeframe can be modified at any time via the project details page.',
    },
    dashboard: 'Check Dashboard',
    finish: 'Finish and Exit',
    recollect: 'Re-collect Data',
    progress: 'Data synchronization progress:',
    collectNonGit: (repo: string) => `Collect non-Git entities in ${repo}`,
    collectGit: (repo: string) => `Collect Git entities in ${repo}`,
    unknownRepo: 'Unknown',
  },
  logs: {
    stepLabel: (step: number, name: string) => `Step ${step} - ${name}`,
    pending: 'Pending',
    notAvailable: 'N/A',
    completed: 'Completed',
    failed: 'Failed',
    records: (count: number) => `Records collected: ${count}`,
  },
  tour: {
    project: {
      title: 'This is the project you just created.',
      description: 'Project is the basic management unit',
    },
    connection: {
      title: 'A connection is automatically created and associated with the project.',
      description: 'The full connection list can be found at the Connections menu.',
    },
    configure: {
      title: 'Click here to configure project',
      description:
        'You can adjust the data scope,  time range and sync frequency of the project. You can also add scope config to transform the raw data before writing to the database.',
    },
  },
};
