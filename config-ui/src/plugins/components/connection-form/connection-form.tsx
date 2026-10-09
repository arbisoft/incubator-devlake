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

import { Alert, Button, message } from 'antd';
import { pick } from 'lodash';
import { useEffect, useMemo, useState } from 'react';

import API from '@/api';
import { addConnection, updateConnection } from '@/features';
import { selectConnection, toTestErrorMessage } from '@/features/connections';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { getPluginConfig } from '@/plugins/utils';
import type { IConnectionAPI } from '@/types';
import { ExternalLink, toUserMessage } from '@/ui';
import { operator } from '@/utils';

import { CONNECTION_FORM_TYPE, COPY, SAVE_ERROR_MAP } from './constants';
import { Form } from './fields';
import {
  CONNECTION_FORM_FIELDS,
  buildChangedTestPayload,
  buildConnectionSavePayload,
  buildNewTestPayload,
  sanitizeCustomHeaders,
} from './payload';
import { Actions, Root } from './styled';
import type { ConnectionFormProps, ConnectionFormType, ConnectionFormValues } from './types';

type TestPayload = NonNullable<Parameters<typeof API.connection.test>[2]>;
type OldTestPayload = Parameters<typeof API.connection.testOld>[1];

export const ConnectionForm = ({ plugin, connectionId, onSuccess }: ConnectionFormProps) => {
  const [type, setType] = useState<ConnectionFormType>(CONNECTION_FORM_TYPE.CREATE);
  const [values, setValues] = useState<ConnectionFormValues>({});
  const [errors, setErrors] = useState<Record<string, unknown>>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectionDetail, setConnectionDetail] = useState<IConnectionAPI>();

  const dispatch = useAppDispatch();
  const connection = useAppSelector((state) => selectConnection(state, `${plugin}-${connectionId}`));
  const selectedConnection = connectionDetail ?? connection;

  // Reset during render, not in an effect: an effect-based reset ran after
  // field components' own mount effects and silently wiped their defaults.
  const resetKey = `${plugin}:${connectionId ?? ''}`;
  const [lastResetKey, setLastResetKey] = useState<string | null>(null);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setType(connectionId ? CONNECTION_FORM_TYPE.UPDATE : CONNECTION_FORM_TYPE.CREATE);
    setConnectionDetail(undefined);
    setErrors({});
    setValues(connectionId && connection ? pick(connection, CONNECTION_FORM_FIELDS) : {});
  }

  // Async refetch stays in an effect; it only adds real saved values on top
  // of the already-reset state above, so it can't reintroduce the race.
  useEffect(() => {
    if (!connectionId) {
      return;
    }
    let canceled = false;
    API.connection
      .get(plugin, connectionId)
      .then((res) => {
        if (canceled) {
          return;
        }
        setConnectionDetail(res);
        setValues(pick(res, CONNECTION_FORM_FIELDS));
        setErrors({});
      })
      .catch(() => undefined);
    return () => {
      canceled = true;
    };
  }, [plugin, connectionId]);

  const pluginConfig = getPluginConfig(plugin);
  const name = pluginConfig?.name;
  const { docLink = '', fields = [], initialValues = {}, showTestResultMessage } = pluginConfig?.connection ?? {};

  const disabled = useMemo(() => {
    return Object.values(errors).some((value) => value);
  }, [errors]);

  const customHeaders = useMemo(
    () => sanitizeCustomHeaders(values.customHeaders as Parameters<typeof sanitizeCustomHeaders>[0]),
    [values.customHeaders],
  );

  if (!plugin || !name) {
    return null;
  }

  const handleTest = async () => {
    const [success, res] = await operator(
      () =>
        type === CONNECTION_FORM_TYPE.UPDATE && connectionId
          ? API.connection.test(
              plugin,
              connectionId,
              buildChangedTestPayload(selectedConnection, values, customHeaders) as TestPayload,
            )
          : API.connection.testOld(plugin, buildNewTestPayload(initialValues, values, customHeaders) as OldTestPayload),
      {
        setOperating: setTesting,
        formatMessage: () => COPY.test.success,
        formatReason: toTestErrorMessage,
        hideToast: !!showTestResultMessage,
      },
    );

    if (success && showTestResultMessage) {
      message.success(res?.message || COPY.test.success);
    }
  };

  const handleSave = async () => {
    // Save and Test diverge on the update path: handleTest sends only fields
    // that changed vs `selectedConnection`, while handleSave sends the merged
    // (plugin defaults + form values), whitelisted payload. Don't unify these
    // without first confirming the save and test endpoints accept the same
    // shape.
    const payload = buildConnectionSavePayload(
      type === CONNECTION_FORM_TYPE.UPDATE ? { ...initialValues, ...selectedConnection } : initialValues,
      { ...values, customHeaders },
    );
    const [success, res] = await operator(
      () =>
        !connectionId
          ? dispatch(addConnection({ plugin, ...payload } as Parameters<typeof addConnection>[0])).unwrap()
          : dispatch(
              updateConnection({ plugin, connectionId, ...payload } as Parameters<typeof updateConnection>[0]),
            ).unwrap(),
      {
        setOperating: setSaving,
        formatMessage: () => (!connectionId ? COPY.save.created : COPY.save.updated),
        formatReason: (error) => toUserMessage(error, SAVE_ERROR_MAP, COPY.save.failed),
      },
    );

    if (success) {
      onSuccess?.(res.id);
    }
  };

  return (
    <Root>
      <Alert
        title={
          <>
            {COPY.docHint(name)} {docLink ? <ExternalLink href={docLink}>{COPY.docLink}</ExternalLink> : COPY.docLink}.
          </>
        }
      />
      <div>
        <Form
          type={type}
          connectionId={connectionId}
          name={name}
          fields={fields}
          initialValues={{ ...initialValues, ...selectedConnection }}
          values={values}
          errors={errors}
          setValues={setValues}
          setErrors={setErrors}
        />
      </div>
      <Actions>
        <Button htmlType="button" type="primary" loading={saving} disabled={disabled || testing} onClick={handleSave}>
          {COPY.save.label}
        </Button>
        <Button htmlType="button" loading={testing} disabled={disabled || saving} onClick={handleTest}>
          {COPY.test.label}
        </Button>
      </Actions>
    </Root>
  );
};
