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

import { CaretRightOutlined } from '@ant-design/icons';
import { theme, Collapse, Form, Input } from 'antd';
import type { CheckboxChangeEvent } from 'antd/lib/checkbox';
import { useMemo, useState, useEffect } from 'react';

import { ExternalLink, HelpTooltip } from '@/components';
import type { TransformationProps } from '@/plugins/components/scope-config-form/types';
import { DOC_URL } from '@/release';

import type { BitbucketServerTransformationValues } from './types';

type Props = TransformationProps<BitbucketServerTransformationValues>;

const allStates = ['new', 'open', 'resolved', 'closed', 'on hold', 'wontfix', 'duplicate', 'invalid'];

export const BitbucketServerTransformation = ({ entities, transformation, setTransformation }: Props) => {
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    if (transformation.deploymentPattern || transformation.productionPattern) {
      setUseCustom(true);
    } else {
      setUseCustom(false);
    }
  }, [transformation]);

  const options = useMemo(() => {
    const disabledOptions = [
      ...(transformation.issueStatusTodo ? transformation.issueStatusTodo.split(',') : []),
      ...(transformation.issueStatusInProgress ? transformation.issueStatusInProgress.split(',') : []),
      ...(transformation.issueStatusDone ? transformation.issueStatusDone.split(',') : []),
      ...(transformation.issueStatusOther ? transformation.issueStatusOther.split(',') : []),
    ];
    return allStates.filter((it) => !disabledOptions.includes(it)).map((it) => ({ label: it, value: it }));
  }, [transformation]);

  const handleChangeUseCustom = (e: CheckboxChangeEvent) => {
    const { checked } = e.target;

    if (!checked) {
      setTransformation({
        ...transformation,
        deploymentPattern: '',
        productionPattern: '',
      });
    }

    setUseCustom(checked);
  };

  const { token } = theme.useToken();

  const panelStyle: React.CSSProperties = {
    marginBottom: 24,
    background: token.colorFillAlter,
    borderRadius: token.borderRadiusLG,
    border: 'none',
  };

  return (
    <Collapse
      bordered={false}
      defaultActiveKey={['TICKET', 'CICD']}
      expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} rev="" />}
      style={{ background: token.colorBgContainer }}
      size="large"
      items={renderCollapseItems({
        entities,
        panelStyle,
        options,
        transformation,
        onChangeTransformation: setTransformation,
        useCustom,
        onChangeUseCustom: handleChangeUseCustom,
      })}
    />
  );
};

const renderCollapseItems = ({
  entities,
  panelStyle,
  transformation,
  onChangeTransformation,
}: {
  entities: string[];
  panelStyle: React.CSSProperties;
  options: Array<{ label: string; value: string }>;
  transformation: BitbucketServerTransformationValues;
  onChangeTransformation: (next: BitbucketServerTransformationValues) => void;
  useCustom: boolean;
  onChangeUseCustom: (e: CheckboxChangeEvent) => void;
}) => {
  const { prType, prComponent, refdiff } = transformation;

  return [
    {
      key: 'CODEREVIEW',
      label: 'Code Review',
      style: panelStyle,
      children: (
        <>
          <p>
            If you use labels to identify types and components of pull requests, use the following RegExes to extract
            them into corresponding columns.{' '}
            <ExternalLink link={DOC_URL.DATA_MODELS.DEVLAKE_DOMAIN_LAYER_SCHEMA.PULL_REQUEST}>Learn More</ExternalLink>
          </p>
          <Form.Item
            label={
              <>
                <span style={{ marginRight: 4 }}>PR Type</span>
                <HelpTooltip content="Text (PR title) that matches the RegEx will be set as the type of a pull request." />
              </>
            }
          >
            <Input
              placeholder="type: ([a-zA-Z0-9_-]+)"
              value={prType ?? ''}
              onChange={(e) => onChangeTransformation({ ...transformation, prType: e.target.value })}
            />
          </Form.Item>
          <Form.Item
            label={
              <>
                <span style={{ marginRight: 4 }}>PR Component</span>
                <HelpTooltip content="Text (PR body) that matches the RegEx will be set as the component of the pull request." />
              </>
            }
          >
            <Input
              placeholder="component: ([a-zA-Z0-9_-]+)"
              value={prComponent ?? ''}
              onChange={(e) =>
                onChangeTransformation({
                  ...transformation,
                  prComponent: e.target.value,
                })
              }
            />
          </Form.Item>
        </>
      ),
    },
    {
      key: 'ADDITIONAL',
      label: 'Additional Settings',
      style: panelStyle,
      children: (
        <>
          <p>
            Enable the <ExternalLink link={DOC_URL.PLUGIN.REFDIFF}>RefDiff</ExternalLink> plugin to pre-calculate
            version-based metrics
            <HelpTooltip content="Calculate the commits diff between two consecutive tags that match the following RegEx. Issues closed by PRs which contain these commits will also be calculated. The result will be shown in table.refs_commits_diffs and table.refs_issues_diffs." />
          </p>
          <div className="refdiff">
            Compare the last
            <Input
              style={{ margin: '0 8px', width: 60 }}
              placeholder="10"
              value={refdiff?.tagsLimit ?? ''}
              onChange={(e) =>
                onChangeTransformation({
                  ...transformation,
                  refdiff: {
                    ...transformation?.refdiff,
                    tagsLimit: +e.target.value,
                  },
                })
              }
            />
            tags that match the
            <Input
              style={{ margin: '0 8px', width: 200 }}
              placeholder="(regex)$"
              value={refdiff?.tagsPattern ?? ''}
              onChange={(e) =>
                onChangeTransformation({
                  ...transformation,
                  refdiff: {
                    ...transformation?.refdiff,
                    tagsPattern: e.target.value,
                  },
                })
              }
            />
            for calculation
          </div>
        </>
      ),
    },
  ].filter((it) => entities.includes(it.key) || it.key === 'ADDITIONAL');
};
