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

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import API from '@/api';
import { PageLoading } from '@/components';
import { PATHS } from '@/config';
import { useRefreshData } from '@/hooks';
import { useDocumentTitle } from '@/ui/hooks';

import { ExitControl } from './components';
import { STORE_KEY } from './components/constants';
import { COPY } from './constants';
import { Context } from './context';
import { Step0 } from './step-0';
import { Step1 } from './step-1';
import { Step2 } from './step-2';
import { Step3 } from './step-3';
import { Step4 } from './step-4';
import * as S from './styled';
import type { OnboardRecord } from './types';

type OnboardInitial = {
  step: number;
  records: OnboardRecord[];
  projectName?: string;
  plugin?: string;
};

interface Props {
  logo?: React.ReactNode;
  title?: React.ReactNode;
}

export const Onboard = ({ logo, title }: Props) => {
  useDocumentTitle(COPY.title);

  const { ready, data } = useRefreshData((signal) => API.store.get(STORE_KEY, signal));

  if (!ready) {
    return <PageLoading />;
  }

  return <OnboardWizard logo={logo} title={title} initial={data} />;
};

interface WizardProps extends Props {
  initial?: OnboardInitial | null;
}

const OnboardWizard = ({ logo, title, initial }: WizardProps) => {
  const [step, setStep] = useState(initial?.step ?? 0);
  const [records, setRecords] = useState<OnboardRecord[]>(initial?.records ?? []);
  const [projectName, setProjectName] = useState<string | undefined>(initial?.projectName);
  const [plugin, setPlugin] = useState<string | undefined>(initial?.plugin);

  const navigate = useNavigate();

  const handleExit = async () => {
    navigate(PATHS.ROOT());
    return true;
  };

  return (
    <Context.Provider
      value={{
        step,
        records,
        done: false,
        projectName,
        plugin,
        setStep,
        setRecords,
        setProjectName,
        setPlugin,
      }}
    >
      <S.Page>
        <S.Inner>
          {step === 0 ? (
            <Step0 logo={logo} title={title} />
          ) : (
            <>
              <S.Header>
                <S.Title>{COPY.heading}</S.Title>
                <ExitControl onExit={handleExit} />
              </S.Header>
              <S.Content>
                {[1, 2, 3].includes(step) && (
                  <S.Step>
                    {COPY.steps.map((it) => (
                      <S.StepItem key={it.step} $activated={it.step === step}>
                        <span>{it.step}</span>
                        <span>{it.title}</span>
                      </S.StepItem>
                    ))}
                  </S.Step>
                )}
                {step === 1 && <Step1 />}
                {step === 2 && <Step2 />}
                {step === 3 && <Step3 />}
                {step === 4 && <Step4 />}
              </S.Content>
            </>
          )}
        </S.Inner>
      </S.Page>
    </Context.Provider>
  );
};
