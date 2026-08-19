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

import type { ComponentType } from 'react';
import { CopyOutlined } from '@ant-design/icons';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { Alert, Button, Flex, Input, message, Modal, Space } from 'antd';

import type { OtelConnectionResponse } from '@/api/otel';
import { ExternalLink, Message } from '@/components';
import { OTEL_LIFECYCLE_ACTION } from './constants';
import { ManagedSettings } from './styled';

export const OTEL_MODAL = {
  CREATE: 'create',
  SNIPPET: 'snippet',
  ROTATE: 'rotate',
  REVOKE: 'revoke',
  HIDE: 'hide',
  FINALIZE: 'finalize',
  APPLY: 'apply',
} as const;

export type OtelModalState = (typeof OTEL_MODAL)[keyof typeof OTEL_MODAL];
export type OtelLifecycleAction = (typeof OTEL_LIFECYCLE_ACTION)[keyof typeof OTEL_LIFECYCLE_ACTION];

type OtelModalProps = {
  current?: OtelConnectionResponse;
  teamName: string;
  createError?: string;
  lifecycleError?: string;
  operating: boolean;
  managedSettings: string;
  onClose: () => void;
  onCreate: () => void;
  onTeamNameChange: (teamName: string) => void;
  onClearCreateError: () => void;
  onAction: (action: OtelLifecycleAction) => void;
};

const CreateModal = ({
  teamName,
  createError,
  operating,
  onClose,
  onCreate,
  onTeamNameChange,
  onClearCreateError,
}: OtelModalProps) => (
  <Modal
    open
    centered
    title="Generate Claude Settings"
    okText="Generate"
    okButtonProps={{ loading: operating, disabled: !teamName.trim() }}
    onCancel={() => {
      onClearCreateError();
      onClose();
    }}
    onOk={onCreate}
  >
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <span>Team name</span>
      <Input
        autoFocus
        maxLength={255}
        placeholder="Platform Engineering"
        value={teamName}
        status={createError ? 'error' : undefined}
        onChange={(event) => {
          onTeamNameChange(event.target.value);
          onClearCreateError();
        }}
      />
      {createError && <Alert type="error" showIcon message={createError} />}
      <Message content="The team name and its derived reporting slug cannot be changed later." />
    </Space>
  </Modal>
);

const SnippetModal = ({ current, managedSettings, onClose }: OtelModalProps) => (
  <Modal open width={900} centered title="Claude managed settings" footer={null} onCancel={onClose}>
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Message content="Copy this now. DevLake does not store the generated password or Basic Auth header." />
      <Message content="Pasting this JSON replaces existing managed env settings, including any console exporter flags." />
      <ManagedSettings>{managedSettings}</ManagedSettings>
      <Flex justify="space-between" align="center">
        <Space direction="vertical" size={4}>
          <span>
            Add this JSON in{' '}
            <ExternalLink link="https://claude.ai/admin-settings/claude-code">
              Claude Code managed settings
            </ExternalLink>
            .
          </span>
          {current?.restartRequired && (
            <Message
              content={
                current.restartHint ||
                'Telemetry settings were generated, but endpoint activation needs support attention.'
              }
            />
          )}
        </Space>
        <CopyToClipboard text={managedSettings} onCopy={() => message.success('Copy successfully.')}>
          <Button icon={<CopyOutlined />}>Copy</Button>
        </CopyToClipboard>
      </Flex>
    </Space>
  </Modal>
);

type LifecycleModalProps = OtelModalProps & {
  action: OtelLifecycleAction;
  title: string;
  content: string;
  danger?: boolean;
  error?: string;
};

const LifecycleModal = ({ action, title, content, danger, error, operating, onClose, onAction }: LifecycleModalProps) => (
  <Modal
    open
    width={720}
    centered
    title={title}
    okText={title.split(' ')[0]}
    okButtonProps={{ loading: operating, danger }}
    onCancel={onClose}
    onOk={() => onAction(action)}
  >
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Message content={content} />
      {error && <Alert type="error" showIcon message={error} />}
    </Space>
  </Modal>
);

const MODAL_KIND = {
  CUSTOM: 'custom',
  LIFECYCLE: 'lifecycle',
} as const;

type OtelModalConfig =
  | {
      kind: typeof MODAL_KIND.CUSTOM;
      component: ComponentType<OtelModalProps>;
    }
  | {
      kind: typeof MODAL_KIND.LIFECYCLE;
      action: OtelLifecycleAction;
      title: string;
      content: string;
      danger?: boolean;
    };

const OTEL_MODALS = {
  [OTEL_MODAL.CREATE]: {
    kind: MODAL_KIND.CUSTOM,
    component: CreateModal,
  },
  [OTEL_MODAL.SNIPPET]: {
    kind: MODAL_KIND.CUSTOM,
    component: SnippetModal,
  },
  [OTEL_MODAL.ROTATE]: {
    kind: MODAL_KIND.LIFECYCLE,
    action: OTEL_LIFECYCLE_ACTION.ROTATE,
    title: 'Rotate Claude Code OTel Credential',
    content: 'The old credential will stay valid as retiring until you finalize rotation.',
  },
  [OTEL_MODAL.FINALIZE]: {
    kind: MODAL_KIND.LIFECYCLE,
    action: OTEL_LIFECYCLE_ACTION.FINALIZE,
    title: 'Finalize Rotation',
    content: 'Retiring credentials will be removed after the telemetry endpoint applies the update.',
  },
  [OTEL_MODAL.APPLY]: {
    kind: MODAL_KIND.LIFECYCLE,
    action: OTEL_LIFECYCLE_ACTION.APPLY,
    title: 'Apply Credential Changes',
    content: 'Retry applying the current credential state to the telemetry endpoint.',
  },
  [OTEL_MODAL.REVOKE]: {
    kind: MODAL_KIND.LIFECYCLE,
    action: OTEL_LIFECYCLE_ACTION.REVOKE,
    title: 'Revoke Claude Code OTel Credential',
    content:
      'All active Claude Code telemetry credentials for this connection will be rejected after the telemetry endpoint applies the update.',
    danger: true,
  },
  [OTEL_MODAL.HIDE]: {
    kind: MODAL_KIND.LIFECYCLE,
    action: OTEL_LIFECYCLE_ACTION.HIDE,
    title: 'Remove Revoked Connection',
    content: 'This removes the revoked connection from this page. Its credential history remains retained in DevLake for audit purposes.',
    danger: true,
  },
} satisfies Record<OtelModalState, OtelModalConfig>;

type OtelModalsProps = OtelModalProps & {
  modal?: OtelModalState;
};

export const OtelModals = ({ modal, ...props }: OtelModalsProps) => {
  if (!modal) return null;

  const config = OTEL_MODALS[modal];
  if (config.kind === MODAL_KIND.LIFECYCLE) {
    return (
      <LifecycleModal
        {...props}
        action={config.action}
        title={config.title}
        content={config.content}
        danger={config.danger}
        error={props.lifecycleError}
      />
    );
  }

  const CustomModal = config.component;
  return <CustomModal {...props} />;
};
