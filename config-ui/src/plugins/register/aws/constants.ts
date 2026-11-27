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

export const AWS_AUTH_TYPE = { ASSUME_ROLE: 'ASSUME_ROLE', ACCESS_KEY: 'ACCESS_KEY' } as const;

export const CHECK_STATUS = {
  ALLOWED: 'allowed',
  DENIED: 'denied',
  NOT_CHECKED: 'not_checked',
  ERROR: 'error',
} as const;

export const REGION_PATTERN = /^[a-z]{2}(-gov)?-[a-z]+-\d$/;

export const REGION_OPTIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ca-central-1',
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-north-1',
  'eu-south-1',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'sa-east-1',
  'me-south-1',
  'af-south-1',
  'us-gov-east-1',
  'us-gov-west-1',
];

export const DEFAULT_RATE_LIMIT = 10000;

export const TRANSFORMATION_KEY = {
  DEPLOYMENT: 'deploymentPattern',
  PRODUCTION: 'productionPattern',
  TRIVY: 'trivyTotalsPattern',
  SMOKE: 'smokeTestPattern',
  ROLLBACK: 'rollbackPattern',
} as const;

export const DEFAULT_PATTERNS = {
  [TRANSFORMATION_KEY.DEPLOYMENT]: '(?i)(deploy|release)',
  [TRANSFORMATION_KEY.PRODUCTION]: '(?i)(^|[^a-z])prod(uction)?([^a-z]|$)',
  [TRANSFORMATION_KEY.TRIVY]: 'Total: (\\d+) \\((.*)\\)',
  [TRANSFORMATION_KEY.SMOKE]: '(?i)smoke test (passed|failed)',
  [TRANSFORMATION_KEY.ROLLBACK]: '(?i)(rolling .* back|rolled back|rollback)',
};

// Go regexp syntax JavaScript lacks: inline flag groups such as (?i) and named groups written (?P<name>).
export const GO_INLINE_FLAGS = /\(\?[imsU]+\)/g;
export const GO_NAMED_GROUP = /\(\?P</g;
export const JS_NAMED_GROUP = '(?<';

const TRANSFORMATION_GROUP = {
  DEPLOYMENTS: 'deployments',
  LOGS: 'logs',
} as const;

export const TRANSFORMATION_GROUPS = [
  {
    key: TRANSFORMATION_GROUP.DEPLOYMENTS,
    title: 'Deployments',
    description: 'Which runs count as deployments and which pipelines are production, for DORA.',
  },
  {
    key: TRANSFORMATION_GROUP.LOGS,
    title: 'Build log signals',
    description:
      'Matched against build log lines. Echoed script lines are ignored, and smoke-test and rollback patterns apply only to deployment builds. Logs expire (about 14 days), so a changed pattern applies to new builds, and to older ones still in retention after a full re-sync.',
  },
] as const;

export const TRANSFORMATION_FIELDS = [
  {
    key: TRANSFORMATION_KEY.DEPLOYMENT,
    group: TRANSFORMATION_GROUP.DEPLOYMENTS,
    label: 'Deployment',
    help: 'Matched against stage and action names. A pipeline with a matching stage or action is a deployment pipeline: every run counts as a deployment for DORA.',
  },
  {
    key: TRANSFORMATION_KEY.PRODUCTION,
    group: TRANSFORMATION_GROUP.DEPLOYMENTS,
    label: 'Production',
    help: 'Matched against the pipeline name. Leave empty to treat every pipeline as production.',
  },
  {
    key: TRANSFORMATION_KEY.TRIVY,
    group: TRANSFORMATION_GROUP.LOGS,
    label: 'Trivy totals',
    help: "Trivy's summary line. Group 1 is the total and group 2 the counts by severity.",
  },
  {
    key: TRANSFORMATION_KEY.SMOKE,
    group: TRANSFORMATION_GROUP.LOGS,
    label: 'Smoke test',
    help: 'Group 1 captures whether the smoke test passed or failed.',
  },
  {
    key: TRANSFORMATION_KEY.ROLLBACK,
    group: TRANSFORMATION_GROUP.LOGS,
    label: 'Rollback',
    help: 'Each matching line counts as one rollback.',
  },
] as const;

export const REQUIREMENT_LABEL: Record<string, string> = {
  required: 'Required',
  optional: 'Optional',
  cost_explorer: 'Cost Explorer',
  assume_role: 'Assume role',
};

export const COPY = {
  pluginName: 'AWS',
  rateLimit: 'Set a fixed hourly rate limit if you need to throttle collection speed (default 10,000).',
  dataScopeTitle: 'Pipelines',
  emptyCell: '—',
  authType: {
    label: 'Authentication',
    description:
      'Two connections to the same AWS account in one project double-count deployments, so connect each account once.',
    options: [
      {
        value: AWS_AUTH_TYPE.ASSUME_ROLE,
        label: 'Assume role',
        help: 'Recommended. DevLake borrows a read-only role in your account with an External ID.',
      },
      {
        value: AWS_AUTH_TYPE.ACCESS_KEY,
        label: 'Access key',
        help: 'DevLake signs requests with the access key of one IAM user.',
      },
    ],
  },
  credentials: {
    accessKeyId: {
      [AWS_AUTH_TYPE.ASSUME_ROLE]: {
        label: 'Broker access key ID',
        help: 'Access key ID of the IAM user DevLake signs in with before assuming the role.',
      },
      [AWS_AUTH_TYPE.ACCESS_KEY]: {
        label: 'Access key ID',
        help: 'Access key ID of the IAM user that can read CodePipeline and CodeBuild.',
      },
    },
    secretAccessKey: {
      [AWS_AUTH_TYPE.ASSUME_ROLE]: {
        label: 'Broker secret access key',
        help: 'Secret access key paired with the broker access key ID.',
      },
      [AWS_AUTH_TYPE.ACCESS_KEY]: {
        label: 'Secret access key',
        help: 'Secret access key paired with the access key ID.',
      },
    },
    sessionToken: {
      label: 'Session token',
      help: 'Optional. Only for temporary credentials.',
    },
    roleArn: {
      label: 'Role ARN',
      help: 'ARN of the role DevLake assumes. Save first to get the External ID, then create the role and enter its ARN.',
      required: 'Enter the role ARN of the role you created.',
    },
    accessKeyIdRequired: 'Enter the access key ID.',
    accessKeyPlaceholder: 'AKIAIOSFODNN7EXAMPLE',
    secretPlaceholder: 'Your secret access key',
    maskedPlaceholder: '********',
    rolePlaceholder: 'arn:aws:iam::123456789012:role/devlake',
  },
  regions: {
    label: 'Regions',
    help: 'AWS regions to read pipelines from. Pick from the list or type a region code such as us-east-2.',
    placeholder: 'us-east-2',
    required: 'Choose at least one region.',
    invalid: (region: string) => `${region} is not a valid region code.`,
  },
  costExplorer: {
    label: 'Use Cost Explorer',
    help: 'Real spend by service from Cost Explorer. AWS bills each request (about $0.01); DevLake makes about 2 per night, plus a few once to load the last 13 months.',
  },
  setup: {
    heading: {
      assumeRole: {
        title: 'Role setup',
        description: 'Create these in your AWS account, then enter the role ARN above.',
      },
      accessKey: {
        title: 'IAM user setup',
        description: 'Attach this policy to the IAM user whose access key DevLake uses.',
      },
    },
    loadFailed: 'The setup details could not be loaded.',
    createInfo: {
      [AWS_AUTH_TYPE.ASSUME_ROLE]: 'Save the connection to see the External ID and the policies to create.',
      [AWS_AUTH_TYPE.ACCESS_KEY]: 'Save the connection to see the policy to attach to the IAM user.',
    },
    brokerPlaceholder:
      'The broker ARN could not be looked up. Replace the placeholder in the trust policy with the ARN of your broker user.',
    externalId: {
      label: 'External ID',
      help: "Paste this into the role's trust policy. It can't be changed.",
      copy: 'Copy External ID',
    },
    trustPolicy: {
      label: 'Trust policy',
      help: 'Attach to the role so only the broker can assume it.',
      copy: 'Copy trust policy',
    },
    brokerPolicy: {
      label: 'Broker policy',
      help: 'Attach to the broker user so it can assume the role.',
      copy: 'Copy broker policy',
    },
    permissionPolicy: {
      label: 'Permission policy',
      help: 'Attach to the role (or, with an access key, to the IAM user).',
      copy: 'Copy permission policy',
    },
    permissions: {
      title: 'Permissions DevLake uses',
      ariaLabel: 'Permissions DevLake uses',
      columns: { action: 'Action', usedFor: 'Used for', requirement: 'Requirement' },
      empty: 'No permissions listed.',
    },
  },
  testResult: {
    title: 'Permission check',
    ariaLabel: 'Permission check results',
    account: (accountId: string) => `Connected to account ${accountId}`,
    warnings: 'Some features may be limited',
    empty: 'No checks were run.',
    noAccess: (region: string, detail: string) => ['No access in', region].join(' ') + (detail ? ': ' + detail : ''),
    columns: {
      permission: 'Permission',
      region: 'Region',
      required: 'Required',
      result: 'Result',
      detail: 'Detail',
    },
    status: {
      [CHECK_STATUS.ALLOWED]: 'Allowed',
      [CHECK_STATUS.DENIED]: 'Denied',
      [CHECK_STATUS.NOT_CHECKED]: 'Not checked',
      [CHECK_STATUS.ERROR]: 'Error',
    },
  },
  transformation: {
    invalidPattern: 'Enter a valid regular expression.',
  },
};
