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

import { Button } from 'antd';
import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

import API from '@/api';
import { PATHS } from '@/config';
import { BRAND_TONE, BrandBlock } from '@/ui';
import { operator } from '@/utils';

import { ExitControl } from './components';
import { STORE_KEY } from './components/constants';
import { COPY, WIZARD_STEP } from './constants';
import { Context } from './context';
import * as S from './styled';

interface Props {
  logo?: React.ReactNode;
  title?: React.ReactNode;
}

export const Step0 = ({ logo = <BrandBlock tone={BRAND_TONE.PAGE} />, title = COPY.defaultProduct }: Props) => {
  const [operating, setOperating] = useState(false);

  const navigate = useNavigate();

  const { step, records, done, projectName, plugin, setStep } = useContext(Context);

  const handleExit = async () => {
    const [success] = await operator(
      () => API.store.set(STORE_KEY, { step: WIZARD_STEP.WELCOME, records, done, projectName, plugin }),
      { setOperating, hideToast: true },
    );

    if (success) {
      navigate(PATHS.ROOT());
    }

    return success;
  };

  const handleSubmit = async () => {
    const [success] = await operator(
      async () => API.store.set(STORE_KEY, { step: WIZARD_STEP.PROJECT, records, done, projectName, plugin }),
      { setOperating, hideToast: true },
    );

    if (success) {
      setStep(step + 1);
    }
  };

  return (
    <div>
      <S.HeroBar>
        {logo}
        <ExitControl onExit={handleExit} />
      </S.HeroBar>
      <S.Hero>
        <S.Welcome>
          {COPY.welcome} <span>{title}</span>
        </S.Welcome>
        <S.Subtitle>{COPY.subtitle}</S.Subtitle>
        <S.Start>
          <Button block size="large" type="primary" loading={operating} onClick={handleSubmit}>
            {COPY.start}
          </Button>
        </S.Start>
      </S.Hero>
    </div>
  );
};
