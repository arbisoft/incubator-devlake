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

import { Fragment, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme, Badge, Modal } from 'antd';
import { chunk } from 'lodash';

import { selectPlugins, selectAllConnections, selectWebhooks } from '@/features/connections';
import API from '@/api';
import { OTEL_CREDENTIAL_STATUS } from '@/api/otel';
import { PATHS } from '@/config';
import { useAppSelector, useRefreshData } from '@/hooks';
import { getPluginConfig, ConnectionList, ConnectionForm } from '@/plugins';
import { formatPlural } from '@/utils';

import ClaudeCodeOtelIcon from '@/plugins/register/claude_otel/assets/icon.svg?react';
import * as S from './styled';

const SORT_START_WITH = ['o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
const CLAUDE_PLUGIN = 'claude';

interface StatusBadgeProps {
  count: number;
  color: string;
  text: string;
}

const StatusBadge = ({ count, color, text }: StatusBadgeProps) => {
  if (count <= 0) return null;
  return <Badge color={color} text={text} />;
};

export const Connections = () => {
  const [type, setType] = useState<'list' | 'form'>();
  const [plugin, setPlugin] = useState('');

  const {
    token: { colorPrimary },
  } = theme.useToken();

  const pluginConfig = useMemo(() => getPluginConfig(plugin), [plugin]);

  const navigate = useNavigate();

  const plugins = useAppSelector(selectPlugins);
  const connections = useAppSelector(selectAllConnections);
  const webhooks = useAppSelector(selectWebhooks);
  // Separate ready credentials from connections that need auth-file recovery or application.
  const { data: otelConnections } = useRefreshData(() => API.otel.list(), []);
  const otelCredentialSummary = useMemo(
    () =>
      otelConnections?.reduce(
        (summary, connection) => {
          if (connection.recoveryRequired) summary.recoveryRequired += 1;
          if (connection.restartRequired) summary.restartRequired += 1;
          if (!connection.restartRequired && !connection.recoveryRequired) {
            summary.active += connection.credentials.filter(
              (credential) => credential.status === OTEL_CREDENTIAL_STATUS.ACTIVE,
            ).length;
          }
          return summary;
        },
        { active: 0, restartRequired: 0, recoveryRequired: 0 },
      ) ?? { active: 0, restartRequired: 0, recoveryRequired: 0 },
    [otelConnections],
  );

  const filterWebhookPlugins = plugins.filter((p) => p !== 'webhook');
  const index = filterWebhookPlugins.findIndex((p) => SORT_START_WITH.includes(p[0]));

  const [firstPlugins, secondPlugins] = useMemo(() => {
    if (index > 0) {
      return chunk(filterWebhookPlugins, index);
    }
    return [filterWebhookPlugins, []];
  }, [index]);

  const handleShowListDialog = (plugin: string) => {
    setType('list');
    setPlugin(plugin);
  };

  const handleShowFormDialog = () => {
    setType('form');
  };

  const handleHideDialog = () => {
    setType(undefined);
    setPlugin('');
  };

  const handleSuccessAfter = async (plugin: string, id: ID) => {
    navigate(PATHS.CONNECTION(plugin, id));
  };

  const renderOtelConnection = () => (
    <li key="claude-code-otel" onClick={() => navigate(PATHS.OTEL())}>
      <span className="logo">
        <ClaudeCodeOtelIcon />
      </span>
      <span className="name">Claude Code OTel</span>
      <span className="count">
        {otelCredentialSummary.active ||
        otelCredentialSummary.restartRequired ||
        otelCredentialSummary.recoveryRequired ? (
          <span className="otel-credential-summary">
            <StatusBadge
              count={otelCredentialSummary.active}
              color={colorPrimary}
              text={formatPlural(otelCredentialSummary.active, 'active credential')}
            />
            <StatusBadge
              count={otelCredentialSummary.recoveryRequired}
              color="#ff4d4f"
              text={`${formatPlural(otelCredentialSummary.recoveryRequired, 'connection')} needing storage recovery`}
            />
            <StatusBadge
              count={otelCredentialSummary.restartRequired}
              color="#faad14"
              text={`${formatPlural(otelCredentialSummary.restartRequired, 'connection')} requiring action`}
            />
          </span>
        ) : (
          'No connection'
        )}
      </span>
    </li>
  );

  return (
    <S.Wrapper theme={colorPrimary}>
      <h1>Connections</h1>
      <h5>
        Create and manage data connections from the following data sources or Webhooks to be used in syncing data in
        your Projects.
      </h5>
      <h2>Data Connections</h2>
      <h5>You can create and manage data connections for the following data sources and use them in your Projects.</h5>
      <h4>A-N</h4>
      <ul>
        {firstPlugins.map((plugin) => {
          const pluginConfig = getPluginConfig(plugin);
          const connectionCount = connections.filter((cs) => cs.plugin === plugin).length;
          return (
            <Fragment key={plugin}>
              <li onClick={() => handleShowListDialog(plugin)}>
                {pluginConfig.isBeta && <span className="beta">Beta</span>}
                <span className="logo">{pluginConfig.icon({ color: colorPrimary })}</span>
                <span className="name">{pluginConfig.name}</span>
                <span className="count">
                  {connectionCount ? (
                    <Badge color={colorPrimary} text={`${connectionCount} connections`} />
                  ) : (
                    'No connection'
                  )}
                </span>
              </li>
              {plugin === CLAUDE_PLUGIN && renderOtelConnection()}
            </Fragment>
          );
        })}
        {!firstPlugins.includes(CLAUDE_PLUGIN) && renderOtelConnection()}
      </ul>
      <h4>O-Z</h4>
      <ul>
        {secondPlugins.map((plugin) => {
          const pluginConfig = getPluginConfig(plugin);
          const connectionCount = connections.filter((cs) => cs.plugin === plugin).length;
          return (
            <li key={plugin} onClick={() => handleShowListDialog(plugin)}>
              {pluginConfig.isBeta && <span className="beta">Beta</span>}
              <span className="logo">{pluginConfig.icon({ color: colorPrimary })}</span>
              <span className="name">{pluginConfig.name}</span>
              <span className="count">
                {connectionCount ? (
                  <Badge color={colorPrimary} text={`${connectionCount} connections`} />
                ) : (
                  'No connection'
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <h2>Webhooks</h2>
      <h5>
        You can use webhooks to import deployments and incidents from the unsupported data integrations to calculate
        DORA metrics, etc.
      </h5>
      <ul>
        {plugins
          .filter((plugin) => plugin === 'webhook')
          .map((plugin) => {
            const pluginConfig = getPluginConfig(plugin);
            const connectionCount = webhooks.length;
            return (
              <li key={plugin} onClick={() => handleShowListDialog(plugin)}>
                <span className="logo">{pluginConfig.icon({ color: colorPrimary })}</span>
                <span className="name">{pluginConfig.name}</span>
                <span className="count">
                  {connectionCount ? (
                    <Badge color={colorPrimary} text={`${connectionCount} connections`} />
                  ) : (
                    'No connection'
                  )}
                </span>
              </li>
            );
          })}
      </ul>
      {type === 'list' && pluginConfig && (
        <Modal
          open
          width={820}
          centered
          title={
            <S.ModalTitle>
              <span className="icon">{pluginConfig.icon({ color: colorPrimary })}</span>
              <span className="name">Manage Connections: {pluginConfig.name}</span>
            </S.ModalTitle>
          }
          footer={null}
          onCancel={handleHideDialog}
        >
          <ConnectionList plugin={plugin} onCreate={handleShowFormDialog} />
        </Modal>
      )}
      {type === 'form' && pluginConfig && (
        <Modal
          open
          width={820}
          centered
          title={
            <S.ModalTitle>
              <span className="icon">{pluginConfig.icon({ color: colorPrimary })}</span>
              <span className="name">Manage Connections: {pluginConfig.name}</span>
            </S.ModalTitle>
          }
          footer={null}
          onCancel={handleHideDialog}
        >
          <ConnectionForm plugin={plugin} onSuccess={(id) => handleSuccessAfter(plugin, id)} />
        </Modal>
      )}
    </S.Wrapper>
  );
};
