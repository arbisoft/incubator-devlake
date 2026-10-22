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

import { Radio, Button, Collapse } from 'antd';
import { useEffect, useState } from 'react';

import { ExternalLink } from '@/components';
import JiraIssueTipsImg from '@/images/jira-issue-tips.png';
import type { TransformationProps } from '@/plugins/components/scope-config-form/types';
import { DOC_URL } from '@/release';

import type { JiraTransformationValues } from '../types';

import { DevPanel } from './dev-panel';
import { RemoteLink } from './remote-link';
import * as S from './styled';

const PANEL = { REMOTE_LINK: 'remote-link', DEV_PANEL: 'dev-panel' } as const;

type Panel = (typeof PANEL)[keyof typeof PANEL];

type Props = Pick<
  TransformationProps<JiraTransformationValues>,
  'connectionId' | 'transformation' | 'setTransformation'
>;

export const CrossDomain = ({ connectionId, transformation, setTransformation }: Props) => {
  const [radio, setRadio] = useState<Panel>(PANEL.REMOTE_LINK);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (transformation.applicationType) {
      setRadio(PANEL.DEV_PANEL);
    } else {
      setRadio(PANEL.REMOTE_LINK);
    }
  }, []);

  const handleChangeRadio = (r: Panel) => {
    setTransformation({
      ...transformation,
      applicationType: r === PANEL.REMOTE_LINK ? '' : transformation.applicationType,
      remotelinkRepoPattern: [],
    });
    setRadio(r);
  };

  return (
    <S.CrossDomain>
      <h2>Cross-domain</h2>
      <p>
        Connect `commits` and `issues` to measure metrics such as{' '}
        <ExternalLink link={DOC_URL.METRICS.BUG_COUNT_PER_1K_LINES_OF_CODE}>
          Bug Count per 1k Lines of Code
        </ExternalLink>{' '}
        or man hour distribution on different work types.
      </p>
      <div className="radio">
        <div className="radio-item">
          <Radio checked={radio === PANEL.REMOTE_LINK} onChange={() => handleChangeRadio(PANEL.REMOTE_LINK)} />
          <div className="content">
            <h5>Connect Jira issues and commits via Jira issues’ remote links that match the following pattern</h5>
            <Collapse
              ghost
              expandIconPosition="end"
              items={[
                {
                  key: '1',
                  label:
                    'Input pattern(s) to match and parse commits and repo identifiers from issue remote links. See examples',
                  children: <img src={JiraIssueTipsImg} width="100%" alt="" />,
                },
              ]}
            />
            {radio === PANEL.REMOTE_LINK && (
              <RemoteLink transformation={transformation} setTransformation={setTransformation} />
            )}
          </div>
        </div>
        <div className="radio-item">
          <Radio checked={radio === PANEL.DEV_PANEL} onChange={() => handleChangeRadio(PANEL.DEV_PANEL)} />
          <div className="content">
            <h5>
              Connect Jira issues and commits via{' '}
              <ExternalLink link="https://support.atlassian.com/jira-software-cloud/docs/view-development-information-for-an-issue/">
                development panel
              </ExternalLink>
            </h5>
            <p>Finish the configuration so DevLake can get your Git data from your Jira development panel.</p>
            {radio === PANEL.DEV_PANEL && (
              <>
                {transformation.applicationType && (
                  <div className="application">
                    <span>{transformation.applicationType}</span>
                    <span>{transformation.remotelinkRepoPattern?.[0]?.pattern}</span>
                  </div>
                )}
                <Button onClick={() => setOpen(true)}>
                  {!transformation.applicationType ? 'Configure' : 'Edit Configuration'}
                </Button>
                <DevPanel
                  connectionId={connectionId}
                  transformation={transformation}
                  setTransformation={setTransformation}
                  open={open}
                  onCancel={() => setOpen(false)}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </S.CrossDomain>
  );
};
