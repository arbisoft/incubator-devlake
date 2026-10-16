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

import { Button, ConfigProvider, Tooltip } from 'antd';
import { useState, useContext, useMemo } from 'react';
import { Link } from 'react-router-dom';

import API from '@/api';
import { PATHS } from '@/config';
import { getPluginConfig } from '@/plugins';
import { ConnectionToken } from '@/plugins/components/connection-form/fields/token';
import { Auth as BitbucketAuthField } from '@/plugins/register/bitbucket/connection-fields';
import { operator } from '@/utils';

import { STORE_KEY } from './components/constants';
import { CONNECTION_DEFAULTS, COPY, GUIDE_STEP, ONBOARD_PLUGIN, PLATFORM_NAME, WIZARD_STEP } from './constants';
import { Context } from './context';
import { StepActions } from './step-actions';
import * as S from './styled';
import type { ConnectionDraft, ConnectionTestPayload } from './types';
import { useGuide } from './use-guide';

const getDefaults = (plugin: string): ConnectionDraft =>
  plugin in CONNECTION_DEFAULTS ? CONNECTION_DEFAULTS[plugin as keyof typeof CONNECTION_DEFAULTS] : {};

export const Step2 = () => {
  const [operating, setOperating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState(false);
  const [payload, setPayload] = useState<ConnectionDraft>({});
  const [createdConnectionId, setCreatedConnectionId] = useState<ID>();

  const { step, records, done, projectName, plugin, setStep, setRecords } = useContext(Context);

  const config = useMemo(() => getPluginConfig(plugin as string), [plugin]);

  const guide = useGuide(GUIDE_STEP.CONNECTION, plugin);

  const handleTest = async () => {
    if (!plugin) {
      return;
    }

    setTestStatus(false);
    const [success] = await operator(
      async () => {
        const result = await API.connection.testOld(plugin, {
          ...getDefaults(plugin),
          ...payload,
        } as ConnectionTestPayload);
        if (result.success === false) {
          throw new Error(COPY.connection.connectFailed);
        }
        return result;
      },
      {
        setOperating: setTesting,
        formatMessage: () => COPY.connection.connectSuccess,
        formatReason: () => COPY.connection.connectFailed,
      },
    );

    setTestStatus(success);
  };

  const handleSubmit = async () => {
    if (!plugin || !testStatus || testing || operating) {
      return;
    }

    const [success] = await operator(
      async () => {
        // Reuse the connection from a failed save so a retry does not create a duplicate.
        let connectionId = createdConnectionId;
        if (connectionId === undefined) {
          const connection = await API.connection.create(plugin, {
            name: `${plugin}-${Date.now()}`,
            ...getDefaults(plugin),
            ...payload,
          } as Parameters<typeof API.connection.create>[1]);
          connectionId = connection.id;
          setCreatedConnectionId(connectionId);
        }

        const newRecords = [...records, { plugin, connectionId, blueprintId: '', pipelineId: '', scopeName: '' }];

        await API.store.set(STORE_KEY, {
          step: WIZARD_STEP.SCOPE,
          records: newRecords,
          done,
          projectName,
          plugin,
        });

        setRecords(newRecords);
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

  const busy = testing || operating;

  return (
    <>
      <S.StepContent>
        {PLATFORM_NAME[plugin] && (
          <S.Form>
            <ConfigProvider componentDisabled={busy}>
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
                  setPayload((current) => ({ ...current, token }));
                  setTestStatus(false);
                  setCreatedConnectionId(undefined);
                }}
                error=""
                setError={() => {}}
              />
            </ConfigProvider>
            {connectButton(!payload.token)}
          </S.Form>
        )}
        {plugin === ONBOARD_PLUGIN.BITBUCKET && (
          <S.Form>
            <ConfigProvider componentDisabled={busy}>
              <BitbucketAuthField
                type="create"
                initialValues={{
                  ...CONNECTION_DEFAULTS[ONBOARD_PLUGIN.BITBUCKET],
                  username: '',
                  password: '',
                }}
                values={payload}
                errors={{}}
                setValues={(values: ConnectionDraft) => {
                  setPayload((current) => ({ ...current, ...values }));
                  setTestStatus(false);
                  setCreatedConnectionId(undefined);
                }}
                setErrors={() => {}}
              />
            </ConfigProvider>
            {connectButton(!payload.username || !payload.password)}
          </S.Form>
        )}
        <S.Guide>{guide}</S.Guide>
      </S.StepContent>
      <StepActions
        loading={operating}
        nextDisabled={!testStatus || testing}
        onPrevious={() => setStep(step - 1)}
        onNext={handleSubmit}
      />
    </>
  );
};
