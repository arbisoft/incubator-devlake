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

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flex, Space, Card, Modal, Input, Checkbox, Button, message } from 'antd';

import API from '@/api';
import { OTEL_CONNECTION_STATUS } from '@/api/otel';
import { Block, HelpTooltip, Message } from '@/components';
import { PATHS } from '@/config';
import { useRefreshData } from '@/hooks';
import { IProject } from '@/types';
import { operator } from '@/utils';

import { getOtelProjectError } from '@/routes/otel/utils';

import * as S from './styled';

const RegexPrIssueDefaultValue = '(?mi)(Closes)[\\s]*.*(((and )?#\\d+[ ]*)+)';

interface Props {
  project: IProject;
  onRefresh: () => void;
}

export const SettingsPanel = ({ project, onRefresh }: Props) => {
  const [name, setName] = useState('');
  const [dora, setDora] = useState({
    enable: false,
  });
  const [linker, setLinker] = useState({
    enable: false,
    prToIssueRegexp: '',
  });
  const [issueTrace, setIssueTrace] = useState({
    enable: false,
  });
  const [operating, setOperating] = useState(false);
  const [open, setOpen] = useState(false);

  const navigate = useNavigate();
  const { data: otelConnections, ready: otelConnectionsReady } = useRefreshData(
    () => API.otel.listForProject(project.name),
    [project.name],
  );
  const hasOtelPlacements = Boolean(otelConnections?.length);
  const hasActiveFinalOtelPlacement = Boolean(
    otelConnections?.some(
      (connection) =>
        connection.connection.status === OTEL_CONNECTION_STATUS.ACTIVE && connection.projects.length === 1,
    ),
  );

  useEffect(() => {
    const dora = project.metrics.find((ms) => ms.pluginName === 'dora');
    const linker = project.metrics.find((ms) => ms.pluginName === 'linker');
    const issueTrace = project.metrics.find((ms) => ms.pluginName === 'issue_trace');

    setName(project.name);
    setDora({
      enable: dora?.enable ?? false,
    });
    setLinker({
      enable: linker?.enable ?? false,
      prToIssueRegexp: linker?.pluginOption?.prToIssueRegexp ?? RegexPrIssueDefaultValue,
    });
    setIssueTrace({
      enable: issueTrace?.enable ?? false,
    });
  }, [project]);

  const handleUpdate = async () => {
    if (name !== project.name && hasOtelPlacements) {
      message.error('Remove Claude Code OTel project placements before renaming this project.');
      return;
    }
    const [success] = await operator(
      () =>
        API.project.update(project.name, {
          name,
          description: '',
          metrics: [
            {
              pluginName: 'dora',
              pluginOption: {},
              enable: dora.enable,
            },
            {
              pluginName: 'linker',
              pluginOption: {
                prToIssueRegexp: linker.prToIssueRegexp,
              },
              enable: linker.enable,
            },
            {
              pluginName: 'issue_trace',
              pluginOption: {},
              enable: issueTrace.enable,
            },
          ],
        }),
      {
        setOperating,
      },
    );

    if (success) {
      onRefresh();
      navigate(PATHS.PROJECT(name), {
        state: {
          tabId: 'settings',
        },
      });
    }
  };

  const handleShowDeleteDialog = () => {
    setOpen(true);
  };

  const handleHideDeleteDialog = () => {
    setOpen(false);
  };

  const handleDelete = async () => {
    if (hasOtelPlacements) {
      const [prepared] = await operator(() => API.otel.validateProjectRemoval(project.name), {
        setOperating,
        formatReason: getOtelProjectError,
      });
      if (!prepared) {
        return;
      }
    }
    const [success] = await operator(() => API.project.remove(project.name), {
      setOperating,
      formatMessage: () => 'Delete project successful.',
    });

    if (success) {
      if (hasOtelPlacements) {
        const [placementsRemoved] = await operator(() => API.otel.removeProjectPlacements(project.name), { hideToast: true });
        if (!placementsRemoved) {
          message.warning('Project deleted, but Claude Code OTel placement cleanup needs operator attention.');
        }
      }
      navigate(PATHS.PROJECTS());
    }
  };

  return (
    <Flex vertical>
      <Space direction="vertical" size="large">
        <Card>
          <Block title="Project Name" description="Edit your project name with letters, numbers, -, _ or /" required>
            <Input
              style={{ width: 386 }}
              value={name}
              disabled={hasOtelPlacements}
              onChange={(e) => setName(e.target.value)}
            />
            {hasOtelPlacements && (
              <Message content="Remove the project's Claude Code OTel placements before renaming it. This keeps project-configured telemetry links stable." />
            )}
          </Block>
          <Block
            title={
              <Checkbox checked={dora.enable} onChange={(e) => setDora({ enable: e.target.checked })}>
                Enable DORA Metrics
              </Checkbox>
            }
            description="DORA metrics are four widely-adopted metrics for measuring software delivery performance."
          />
          <Block
            title={
              <Checkbox checked={linker.enable} onChange={(e) => setLinker({ ...linker, enable: e.target.checked })}>
                Associate pull requests with issues
              </Checkbox>
            }
            description={
              <span>
                Parse the issue key with the regex from the title and description of the pull requests in this project.
                <HelpTooltip
                  overlayInnerStyle={{ width: 500 }}
                  content={
                    <>
                      <div>
                        Example 1 - If your PR title or description contains a Jira issue key in the format 'Closes
                        [DI-123](www.yourdomain.atlassian.net/browse/di-123)', please use the following regex template:{' '}
                        (?mi)Closes[\s]*.*(((and)?https://\S+.atlassian.net/browse/\S+[ ]*)+)
                      </div>
                      <div>
                        Example 2 - If your PR title or description contains a GitHub issue key in the format 'Resolves
                        www.github.com/namespace/repo_name/issues/123)', please use the following regex template:{' '}
                        (?mi)Resolves[\s]*.*(((and)?https://github.com/%s/issues/\d+[ ]*)+)
                      </div>
                    </>
                  }
                />
              </span>
            }
          >
            {linker.enable && (
              <Input
                style={{ width: 600 }}
                placeholder={RegexPrIssueDefaultValue}
                value={linker.prToIssueRegexp}
                onChange={(e) => setLinker({ ...linker, prToIssueRegexp: e.target.value })}
              />
            )}
          </Block>
          <Block
            title={
              <Checkbox checked={issueTrace.enable} onChange={(e) => setIssueTrace({ enable: e.target.checked })}>
                Enable issue trace
              </Checkbox>
            }
            description="Parse the issue status and assignee history from issue changelogs. Currently, only Jira issues are supported."
          />
          <Block>
            <Button type="primary" loading={operating} disabled={!name} onClick={handleUpdate}>
              Save
            </Button>
          </Block>
        </Card>
        <Flex justify="center">
          <Button type="primary" danger disabled={!otelConnectionsReady} onClick={handleShowDeleteDialog}>
            Delete Project
          </Button>
        </Flex>
      </Space>
      <Modal
        open={open}
        width={820}
        centered
        title="Are you sure you want to delete this Project?"
        okText="Confirm"
        okButtonProps={{
          loading: operating,
          disabled: hasActiveFinalOtelPlacement,
        }}
        onCancel={handleHideDeleteDialog}
        onOk={handleDelete}
      >
        <S.DialogBody>
          <Message content="This operation cannot be undone. Deleting this project will remove all associated project settings and data. This action does not delete any data connections or the data collected through them." />
          {hasOtelPlacements && (
            <Message
              content={
                hasActiveFinalOtelPlacement
                  ? 'This project is the final placement for an active Claude Code OTel connection. Revoke that connection before deleting the project.'
                  : 'Claude Code OTel placements will be removed from this project. Shared credentials remain active for their other projects.'
              }
            />
          )}
        </S.DialogBody>
      </Modal>
    </Flex>
  );
};
