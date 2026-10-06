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

export const COMPOSITES_COPY = {
  pageHeader: {
    title: 'Connections',
    description: 'Create and manage data connections from data sources or webhooks to use when syncing data.',
    projectTitle: 'Edly-Claude',
    status: 'Status: Failed',
    longTitle: 'A project with an extraordinarily long name that has to wrap inside a narrow container',
    longDescription:
      'A deliberately long description that keeps going so that it has to wrap within the narrow container without breaking the actions.',
    crumbs: { settings: 'Settings', users: 'User Management' },
    action: 'Add user',
  },
  sectionCard: {
    title: 'Allowed domains',
    description: 'Anyone with an email at these domains can sign in without an invite.',
    longTitle: 'A section title that is much longer than the card can show on one line at this width',
    body: 'Section content goes here.',
    action: 'Add domain',
    emptyTitle: 'No domains yet',
    emptyDescription: 'Everyone must be invited individually.',
  },
  dataTable: {
    ariaLabel: 'Users',
    user: 'User',
    role: 'Role',
    status: 'Status',
    email: 'Email',
    note: 'Note',
    emptyTitle: 'No users yet',
    emptyDescription: 'Add your first user to give them access.',
    errorTitle: 'Could not load users',
    errorDescription: 'Check your connection and try again.',
    retry: 'Retry',
    active: 'Active',
    inactive: 'Inactive',
    longNote:
      'A very long note that does not fit in the cell and has to be handled by the table without breaking the layout of its neighbours.',
    selected: (count: number) => `Selected rows: ${count}`,
  },
  confirmModal: {
    open: 'Open',
    title: 'Delete "Arbisoft Website"?',
    description:
      'Any applications or scripts using this API key will no longer be able to access the DevLake API. You cannot undo this action.',
    confirm: 'Delete API key',
    defaultTitle: 'Apply new branding?',
    defaultDescription: 'Everyone signed in sees the new look on their next page load.',
    defaultConfirm: 'Apply branding',
    keep: 'Keep my branding',
    longTitle: 'Delete the project with an extraordinarily long name that goes past the width of the dialog?',
  },
  formModal: {
    open: 'Open',
    title: 'Add a new webhook',
    field: 'Webhook name',
    hint: 'Give your webhook a unique name to help you identify it later.',
    submit: 'Save',
    reason: 'Enter a name to continue.',
    longTitle: 'Add a webhook with an extraordinarily long title that has to wrap inside the dialog header',
  },
  detailDrawer: {
    open: 'Open drawer',
    title: 'Activity detail',
    longTitle: 'Pipeline 2361 with a long title that has to wrap inside the drawer header and not overflow',
    status: 'Failed',
    close: 'Close',
    copy: 'Copy JSON',
  },
  routeTabs: {
    note: 'Navigates to paths under /ui-kit.',
    path: (pathname: string) => `Path: ${pathname}`,
  },
  connectionHealth: {
    message: 'dial tcp 10.0.0.1:443: i/o timeout',
    longMessage:
      'A long error message from the server that spans many words so that the tooltip has to wrap rather than run off the screen.',
    retests: (count: number) => `Retests started: ${count}`,
  },
  integrationCard: {
    github: 'GitHub',
    gitlab: 'GitLab',
    jira: 'Jira',
    category: { scm: 'Code & SCM', issues: 'Issue & Project Tracking' },
    longName: 'An integration with a name that is far longer than the card can show',
    managed: (name: string) => `Manage: ${name}`,
    added: (name: string) => `Add: ${name}`,
    none: 'No action yet',
  },
  progressBanner: {
    message: 'Finish connecting your first tool to start collecting data.',
    longMessage:
      'Finish connecting your first tool, then add a project and a blueprint, so that DevLake can start collecting and showing data for your teams.',
    action: 'Continue',
    dismissed: 'Dismissed',
    reset: 'Show again',
    clicked: 'Action clicked',
    title: 'Onboarding session',
    running: 'Collecting data from your first tool.',
    success: 'The data of your first tool has been collected.',
    partial: 'The data of your first tool has been partly collected.',
    failed: 'Something went wrong with the collection process.',
    details: 'Details',
    dashboard: 'Check dashboard',
    finish: 'Finish',
  },
  brandBlock: { note: 'Always on the dark sidebar background.', customTitle: 'Acme Analytics' },
  accountBlock: {
    name: 'Jane Admin',
    secondary: 'Admin',
    longName: 'A person with an extraordinarily long display name',
    longSecondary: 'a.person.with.a.very.long.address@subdomain.example.com',
    logout: 'Log out',
    profile: 'Profile',
    chosen: (key: string) => `Chosen: ${key}`,
  },
  sidebarNav: {
    projects: 'Projects',
    connections: 'Connections',
    advanced: 'Advanced',
    blueprints: 'Blueprints',
    pipelines: 'Pipelines',
    apiKeys: 'API Keys',
    settings: 'Settings',
    users: 'Users',
    authentication: 'Authentication',
    activities: 'Recent Activities',
    resources: 'Resources',
    docs: 'Docs',
    api: 'API',
    github: 'GitHub',
    slack: 'Slack',
    dashboards: 'Dashboards',
    hidden: 'Hidden item',
    longLabel: 'A navigation label that is far too long to fit in the sidebar',
    active: (path: string) => `Active path: ${path}`,
  },
  pageFooter: { note: 'Shown at the foot of the content column.' },
  appShell: { content: 'Page content', bannerNote: 'Banner slot above the content' },
};
