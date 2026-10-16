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
import { useMemo, useState } from 'react';

import API from '@/api';
import { addConnection, updateConnection } from '@/features';
import {
  CONNECTION_COPY,
  CONNECTION_HTTP_STATUS,
  getErrorResponse,
  selectConnection,
  toConnectionActionErrorMessage,
} from '@/features/connections';
import { useAppDispatch, useAppSelector, useRefreshData } from '@/hooks';
import { getPluginConfig } from '@/plugins/utils';
import type { IConnectionAPI } from '@/types';
import { COMMON_COPY, ExternalLink, toUserMessage, useRefreshVersion } from '@/ui';
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
import type {
  ConnectionFormProps,
  ConnectionFormType,
  ConnectionFormValues,
  OldTestPayload,
  TestPayload,
} from './types';

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
  const { version, refresh } = useRefreshVersion();
  const { ready: detailReady, error: detailError } = useRefreshData(
    (signal) =>
      connectionId === undefined
        ? Promise.resolve(undefined)
        : API.connection.get(plugin, connectionId, signal).then((res) => {
            if (!signal.aborted) {
              setConnectionDetail(res);
              setValues(pick(res, CONNECTION_FORM_FIELDS));
              setErrors({});
            }
            return res;
          }),
    [plugin, connectionId, version],
  );

  // Reset during render so it runs before the fields apply defaults.
  const resetKey = `${plugin}:${connectionId ?? ''}`;
  const [lastResetKey, setLastResetKey] = useState<string | null>(null);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setType(connectionId ? CONNECTION_FORM_TYPE.UPDATE : CONNECTION_FORM_TYPE.CREATE);
    setConnectionDetail(undefined);
    setErrors({});
    setValues(connectionId && connection ? pick(connection, CONNECTION_FORM_FIELDS) : {});
  }

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
  const detailsBlocked =
    connectionId !== undefined && (!detailReady || detailError !== undefined || connectionDetail === undefined);

  if (!plugin || !name) {
    return null;
  }

  const handleTest = async () => {
    if (detailsBlocked) return;

    const [success, res] = await operator(
      async () => {
        const result =
          type === CONNECTION_FORM_TYPE.UPDATE && connectionId
            ? await API.connection.test(
                plugin,
                connectionId,
                buildChangedTestPayload(selectedConnection, values, customHeaders) as TestPayload,
              )
            : await API.connection.testOld(
                plugin,
                buildNewTestPayload(initialValues, values, customHeaders) as OldTestPayload,
              );
        if (result.success === false) {
          throw Object.assign(new Error(CONNECTION_COPY.testFailed.fallback), {
            response: { status: CONNECTION_HTTP_STATUS.BAD_REQUEST, data: { message: result.message } },
          });
        }
        return result;
      },
      {
        setOperating: setTesting,
        formatMessage: () => COPY.test.success,
        formatReason: toConnectionActionErrorMessage,
        hideToast: !!showTestResultMessage,
      },
    );

    if (showTestResultMessage) {
      if (success) message.success(res?.message || COPY.test.success);
      else message.error(toConnectionActionErrorMessage(res));
    }
  };

  const handleSave = async () => {
    if (detailsBlocked) return;

    // Save uses the merged whitelist; Test sends only changed fields.
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
        formatReason: (error) =>
          getErrorResponse(error)?.status === CONNECTION_HTTP_STATUS.CONFLICT
            ? COPY.save.duplicate
            : toConnectionActionErrorMessage(error, (source) =>
                toUserMessage(source, SAVE_ERROR_MAP, COPY.save.failed),
              ),
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
      {connectionId !== undefined && !detailReady && detailError === undefined && (
        <Alert title={COPY.details.loading} />
      )}
      {connectionId !== undefined && detailError !== undefined && (
        <Alert
          title={COPY.details.failed}
          action={
            <Button type="link" onClick={refresh}>
              {COMMON_COPY.retry}
            </Button>
          }
        />
      )}
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
        <Button
          htmlType="button"
          type="primary"
          loading={saving}
          disabled={disabled || testing || detailsBlocked}
          onClick={handleSave}
        >
          {COPY.save.label}
        </Button>
        <Button
          htmlType="button"
          loading={testing}
          disabled={disabled || saving || detailsBlocked}
          onClick={handleTest}
        >
          {COPY.test.label}
        </Button>
      </Actions>
    </Root>
  );
};
