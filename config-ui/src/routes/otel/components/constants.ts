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

import { CONFIRM_TONE } from '@/ui/confirm-modal/constants';

export const TEAM_NAME_MAX_LENGTH = 255;

const OPTION_COPY = {
  metrics: {
    label: 'Metrics',
    description: 'Tokens, cost, lines of code, commits, pull requests and edit decisions.',
    details: [
      'Usage dashboards: tokens, cost and active developers.',
      'Code impact: lines changed, commits and pull requests.',
      'Accepted and rejected edits.',
    ],
  },
  logs: {
    label: 'Events',
    description: 'Prompts, skills and permission modes for each session.',
    details: [
      'Prompts per session and developer.',
      'Skills used in each prompt.',
      'Permission mode changes, such as plan mode.',
    ],
  },
  promptText: {
    label: 'Prompt text',
    description: 'Keep the text of each prompt in raw telemetry. Off still counts prompts.',
    details: ['The text developers type, kept in raw telemetry for 90 days.', 'Never copied into dashboards.'],
  },
  toolDetails: {
    label: 'Skill and MCP names',
    description: 'Attribute prompts to skills, plugins and MCP servers.',
    details: [
      'Skill, plugin and MCP server names on each prompt.',
      'Command lines and file paths are dropped when ingested.',
    ],
  },
  repository: {
    label: 'Repository',
    description: 'Record the repository each prompt ran in. Needs Claude Code v2.1.269 or later.',
    details: [
      "The repository of each prompt's session, from its origin remote.",
      'Credentials in the remote URL are stripped.',
    ],
  },
};

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
    options: {
      title: 'Telemetry to send',
      ...OPTION_COPY,
      rotateNotice: "Choices aren't remembered. Re-apply the options this team used before rotating.",
      lastSignal: 'Metrics or events must stay on.',
      help: (label: string) => `About ${label}`,
      storage: (rawMb: number, monthlyMb: number) =>
        `Roughly ${rawMb} MB per developer over 90 days, plus ${monthlyMb} MB a month that is kept.`,
      storageRawOnly: (rawMb: number) => `Roughly ${rawMb} MB per developer over 90 days. Nothing is kept after that.`,
      storageNone: 'Adds almost no storage.',
      estimate: (rawMb: number, monthlyMb: number) =>
        `Estimated storage per developer: about ${rawMb} MB of raw telemetry kept for 90 days, plus about ${monthlyMb} MB a month kept indefinitely.`,
    },
  },
  range: {
    label: 'Days to rebuild (UTC)',
    hint: (min: string, max: string) => `Pick days from ${min} to ${max}. Raw telemetry is kept for 90 days.`,
    today: 'Metrics for today finish rebuilding after the next midnight UTC.',
  },
  rebind: {
    title: 'Change organization',
    submit: 'Continue',
    team: 'Team',
    current: 'Current organization',
    notBound: 'Not bound yet',
    next: 'New organization',
    field: {
      label: 'New organization ID',
      placeholder: '00000000-0000-0000-0000-000000000000',
      hint: 'The Anthropic organization UUID this team sends telemetry from.',
    },
    invalid: 'Enter the organization ID as a UUID.',
    same: 'This connection is already bound to this organization.',
    acceptOnly:
      "From now on, only this organization's telemetry is accepted. Other organizations and personal Pro or Max accounts are dropped.",
    revoked: 'This connection is revoked; the change only affects rebuilding its past data.',
    wrongId: "A wrong ID silently drops the whole team's telemetry, even though the credentials still work.",
    rebuild: 'Rebuild past data',
    rebuildHint:
      "Past days only recover through a rebuild. It recomputes every team's metrics, prompts and events for those days; other teams' numbers stay the same.",
    previousOrg:
      'Metric data received under the previous organization is removed for those days. Existing prompts and events remain.',
    unavailable: "No retained data for this connection's live period.",
    confirm: {
      tone: CONFIRM_TONE.DANGER,
      title: (name: string) => `Change the organization for ${name}?`,
      description: () => 'Telemetry from any other organization is dropped after this change.',
      confirm: 'Change organization',
      slug: (slug: string) => `Type ${slug} to confirm`,
    },
    done: (name: string) => `Organization changed for ${name}.`,
  },
  replayModal: {
    title: 'Rebuild data (all teams)',
    submit: 'Rebuild',
    notice:
      "Every team's metrics, prompts and events for these days are rebuilt from retained telemetry. Use it after a converter fix. Live data pauses while it runs.",
    confirm: {
      tone: CONFIRM_TONE.DANGER,
      title: () => "Rebuild every team's data?",
      description: (days: string) => `Every team's metrics, prompts and events for ${days} (UTC) are rebuilt.`,
      confirm: 'Rebuild',
    },
  },
};
