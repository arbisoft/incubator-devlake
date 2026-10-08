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

import { Button, Tooltip } from 'antd';
import { useState, useContext, useMemo } from 'react';
import { Link } from 'react-router-dom';

import API from '@/api';
import { PATHS } from '@/config';
import { getPluginConfig } from '@/plugins';
import { ConnectionToken } from '@/plugins/components/connection-form/fields/token';
import { operator } from '@/utils';

import { STORE_KEY } from './components/constants';
import { CONNECTION_DEFAULTS, COPY, GUIDE_STEP, ONBOARD_PLUGIN, PLATFORM_NAME, WIZARD_STEP } from './constants';
import { Context } from './context';
import { StepActions } from './step-actions';
import * as S from './styled';
import type { ConnectionDraft } from './types';
import { useGuide } from './use-guide';

type TestPayload = Parameters<typeof API.connection.testOld>[1];

const getDefaults = (plugin: string): ConnectionDraft =>
  plugin in CONNECTION_DEFAULTS ? CONNECTION_DEFAULTS[plugin as keyof typeof CONNECTION_DEFAULTS] : {};

export const Step2 = () => {
  const [operating, setOperating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState(false);
  const [payload, setPayload] = useState<ConnectionDraft>({});

  const { step, records, done, projectName, plugin, setStep, setRecords } = useContext(Context);

  const config = useMemo(() => getPluginConfig(plugin as string), [plugin]);

  // Get the auth field component for Bitbucket
  const BitbucketAuthField = useMemo(() => {
    if (plugin === ONBOARD_PLUGIN.BITBUCKET && config?.connection?.fields) {
      return config.connection.fields[1];
    }
    return null;
  }, [plugin, config]);

  const guide = useGuide(GUIDE_STEP.CONNECTION, plugin);

  const handleTest = async () => {
    if (!plugin) {
      return;
    }

    const [success] = await operator(
      async () => await API.connection.testOld(plugin, { ...getDefaults(plugin), ...payload } as TestPayload),
      {
        setOperating: setTesting,
        formatMessage: () => COPY.connection.connectSuccess,
        formatReason: () => COPY.connection.connectFailed,
      },
    );

    if (success) {
      setTestStatus(true);
    }
  };

  const handleSubmit = async () => {
    if (!plugin) {
      return;
    }

    const [success] = await operator(
      async () => {
        const connection = await API.connection.create(plugin, {
          name: `${plugin}-${Date.now()}`,
          ...getDefaults(plugin),
          ...payload,
        } as Parameters<typeof API.connection.create>[1]);

        const newRecords = [
          ...records,
          { plugin, connectionId: connection.id, blueprintId: '', pipelineId: '', scopeName: '' },
        ];

        setRecords(newRecords);

        await API.store.set(STORE_KEY, {
          step: WIZARD_STEP.SCOPE,
          records: newRecords,
          done,
          projectName,
          plugin,
        });
      },
      {
        setOperating,
        hideToast: true,
      },
    );

    if (success) {
      setStep(step + 1);
    }
  };

  if (!plugin) {
    return null;
  }

  const connectButton = (disabled: boolean) => (
    <S.Connect>
      <Tooltip title={COPY.connection.testTooltip}>
        <Button type="primary" disabled={disabled} loading={testing} onClick={handleTest}>
          {COPY.connection.connect}
        </Button>
      </Tooltip>
    </S.Connect>
  );

  return (
    <>
      <S.StepContent>
        {PLATFORM_NAME[plugin] && (
          <S.Form>
            <ConnectionToken
              type="create"
              label={COPY.connection.tokenLabel}
              subLabel={
                <>
                  {COPY.connection.tokenDescription(PLATFORM_NAME[plugin], config.name)}{' '}
                  <Link to={PATHS.CONNECTIONS()}>{COPY.dataConnections}</Link>.
                </>
              }
              initialValue=""
              value={payload.token ?? ''}
              setValue={(token) => {
                setPayload({ ...payload, token });
                setTestStatus(false);
              }}
              error=""
              setError={() => {}}
            />
            {connectButton(!payload.token)}
          </S.Form>
        )}
        {plugin === ONBOARD_PLUGIN.BITBUCKET && BitbucketAuthField && (
          <S.Form>
            {BitbucketAuthField({
              type: 'create',
              initialValues: {
                ...CONNECTION_DEFAULTS[ONBOARD_PLUGIN.BITBUCKET],
                username: '',
                password: '',
              },
              values: payload,
              errors: {},
              setValues: (values: ConnectionDraft) => {
                setPayload({ ...payload, ...values });
                setTestStatus(false);
              },
              setErrors: () => {},
            })}
            {connectButton(!payload.username || !payload.password)}
          </S.Form>
        )}
        <S.Guide>{guide}</S.Guide>
      </S.StepContent>
      <StepActions
        loading={operating}
        nextDisabled={!testStatus}
        onPrevious={() => setStep(step - 1)}
        onNext={handleSubmit}
      />
    </>
  );
};
