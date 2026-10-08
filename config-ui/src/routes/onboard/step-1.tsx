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

import { message } from 'antd';
import { useState, useContext } from 'react';
import { Link } from 'react-router-dom';

import API from '@/api';
import { Block } from '@/components';
import { PATHS } from '@/config';
import { ConnectionSelect } from '@/plugins';
import { operator } from '@/utils';

import { STORE_KEY } from './components/constants';
import { CONNECTION_OPTIONS, COPY, DEFAULT_GUIDE, GUIDE_STEP, WIZARD_STEP } from './constants';
import { Context } from './context';
import { StepActions } from './step-actions';
import * as S from './styled';
import { useGuide } from './use-guide';

export const Step1 = () => {
  const [operating, setOperating] = useState(false);

  const { step, records, done, projectName, plugin, setStep, setProjectName, setPlugin } = useContext(Context);

  const guide = useGuide(GUIDE_STEP.PROJECT, plugin ?? DEFAULT_GUIDE);

  const handleSubmit = async () => {
    if (!projectName || !plugin) {
      return;
    }

    const [, res] = await operator(() => API.project.checkName(projectName), {
      setOperating,
      hideToast: true,
    });

    if (res.exist) {
      message.error(COPY.project.nameTaken(projectName));
      return;
    }

    const [success] = await operator(
      () => API.store.set(STORE_KEY, { step: WIZARD_STEP.CONNECTION, records, done, projectName, plugin }),
      { setOperating, hideToast: true },
    );

    if (success) {
      setStep(step + 1);
    }
  };

  return (
    <>
      <S.StepContent>
        <S.Form>
          <Block title={COPY.project.name} description={COPY.project.nameDescription} required>
            <S.NameInput
              placeholder={COPY.project.namePlaceholder}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </Block>
          <Block
            title={COPY.project.connection}
            description={
              <>
                {COPY.project.connectionDescription} <Link to={PATHS.CONNECTIONS()}>{COPY.dataConnections}</Link>.
              </>
            }
            required
          >
            <ConnectionSelect
              placeholder={COPY.project.connectionPlaceholder}
              options={CONNECTION_OPTIONS}
              value={plugin}
              onChange={setPlugin}
            />
          </Block>
        </S.Form>
        <S.Guide>{guide}</S.Guide>
      </S.StepContent>
      <StepActions
        loading={operating}
        nextDisabled={!projectName || !plugin}
        onPrevious={() => setStep(step - 1)}
        onNext={handleSubmit}
      />
    </>
  );
};
