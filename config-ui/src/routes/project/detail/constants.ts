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

import { PROJECT_TAB } from '@/config/route-keys';
import type { ProjectTab } from '@/config/types';

export const COPY = {
  breadcrumbProjects: 'Projects',
  notFound: (name: string) => `Project not found with project name: ${name}`,
  tabsLabel: 'Project sections',
  noBlueprint: {
    title: 'This project has no blueprint',
    description: 'The blueprint is created with the project. Without one there is no status or configuration to show.',
  },
  webhooks: {
    title: 'Webhooks',
    notice: {
      dora: 'The data pushed by Webhooks will only be calculated for DORA in the next run of the Blueprint of this project because DORA relies on the post-processing of "deployments," "incidents," and "pull requests" triggered by running the blueprint.',
      beforeLink: 'To calculate DORA after receiving Webhook data immediately, you can visit the',
      link: 'Status tab',
      afterLink: 'of the Blueprint page and click on Run Now.',
    },
    selectExisting: 'Select Existing Webhooks',
    noBlueprint: 'This project has no blueprint to attach webhooks to.',
    attached: 'Webhooks added to this project.',
    detached: 'Webhook removed from this project.',
    updateFailed: 'The project webhooks could not be updated. Try again.',
  },
  otel: {
    title: 'Claude Code OTel',
    note: 'This project shows telemetry configured for its linked teams. Shared teams appear in every linked project and do not represent repository-level attribution.',
    add: 'Add Claude Code OTel',
    manage: 'Manage',
    manageFor: (team: string) => `Manage ${team}`,
    tableLabel: 'Claude Code OTel connections',
    columns: { team: 'Team', placement: 'Placement', status: 'Status' },
    projectOnly: 'Project only',
    shared: (count: number) => `Shared across ${count} projects`,
    empty: {
      title: 'No Claude Code OTel connections',
      description: 'No Claude Code OTel connections are linked to this project.',
    },
  },
  settings: {
    details: 'Project details',
    name: {
      label: 'Project name',
      description:
        'This name appears across dashboards, blueprints and API responses. Letters, numbers, and the characters -, _ or / only.',
    },
    dora: {
      label: 'Enable DORA metrics',
      description:
        'Calculates deployment frequency, lead time for changes, change failure rate and time to restore service for this project.',
    },
    linker: {
      label: 'Associate pull requests with issues',
      description:
        'Parses the issue key from pull request titles and descriptions using this project’s regex, so pull requests link back to their issues.',
      regexLabel: 'Pull request to issue regex',
      help: 'Regex examples',
      examples: [
        "Example 1 - If your PR title or description contains a Jira issue key in the format 'Closes [DI-123](www.yourdomain.atlassian.net/browse/di-123)', please use the following regex template: (?mi)Closes[\\s]*.*(((and)?https://\\S+.atlassian.net/browse/\\S+[ ]*)+)",
        "Example 2 - If your PR title or description contains a GitHub issue key in the format 'Resolves www.github.com/namespace/repo_name/issues/123)', please use the following regex template: (?mi)Resolves[\\s]*.*(((and)?https://github.com/%s/issues/\\d+[ ]*)+)",
      ],
    },
    issueTrace: {
      label: 'Enable issue trace',
      description: 'Parses issue status and assignee history from issue changelogs. Jira issues only.',
    },
    save: 'Save changes',
    discard: 'Discard',
    saved: 'Project settings saved.',
    saveFailed:
      'The project settings could not be saved. If the name is already used by another project, choose a different one.',
    notFound: 'This project no longer exists.',
    delete: {
      open: 'Delete project',
      title: (name: string) => `Delete project "${name}"?`,
      description:
        'This cannot be undone. Deleting this project removes its blueprint, metric settings, scope mappings, pull request metrics, incident-deployment relations and user access mappings. Data connections and the data collected through them are kept.',
      confirm: 'Delete project',
      success: 'Project deleted.',
      failed: 'The project could not be deleted. Try again.',
      unfinishedPipelines:
        'This project has unfinished pipelines. Cancel them or wait for them to finish, then try again.',
      otelRemoved:
        'Claude Code OTel placements will be removed from this project. Shared credentials remain active for their other projects.',
      otelFinalActive:
        'This project is the final placement for an active Claude Code OTel connection. Revoke that connection before deleting the project.',
    },
  },
  tabs: {
    [PROJECT_TAB.BLUEPRINT]: 'Blueprint',
    [PROJECT_TAB.WEBHOOKS]: 'Webhooks',
    [PROJECT_TAB.CLAUDE_CODE_OTEL]: 'Claude Code OTel',
    [PROJECT_TAB.SETTINGS]: 'Settings',
  } satisfies Record<ProjectTab, string>,
} as const;

export const PROJECT_PLUGIN = {
  DORA: 'dora',
  LINKER: 'linker',
  ISSUE_TRACE: 'issue_trace',
} as const;

export const DEFAULT_PR_ISSUE_REGEXP = '(?mi)(Closes)[\\s]*.*(((and )?#\\d+[ ]*)+)';

export const DELETE_WARNING = {
  OTEL_REMOVED: 'otelRemoved',
  OTEL_FINAL_ACTIVE: 'otelFinalActive',
} as const;

const HTTP_NOT_FOUND = '404';
const HTTP_CONFLICT = '409';

export const SAVE_ERROR_MAP: Record<string, string> = {
  [HTTP_NOT_FOUND]: COPY.settings.notFound,
};

export const DELETE_ERROR_MAP: Record<string, string> = {
  [HTTP_NOT_FOUND]: COPY.settings.notFound,
  [HTTP_CONFLICT]: COPY.settings.delete.unfinishedPipelines,
};

export const OTEL_COLUMN = { TEAM: 'team', PLACEMENT: 'placement', STATUS: 'status', ACTIONS: 'actions' } as const;
