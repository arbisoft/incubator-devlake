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

import { Alert, Form, Input } from 'antd';
import { useEffect, useState } from 'react';

import API from '@/api';
import { PATHS } from '@/config';
import { useDocumentTitle } from '@/ui/hooks';

import { AuthLayout } from '../login/auth-layout';
import { ActionButton, Notices } from '../login/styled';

import { COPY, MIN_PASSWORD_LENGTH } from './constants';
import type { PasswordChangeValues } from './types';

export const ChangePassword = () => {
  useDocumentTitle(COPY.title);

  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    API.auth
      .userinfo()
      .then((user) => {
        if (cancelled) return;
        if (!user.authenticated) {
          window.location.replace(PATHS.LOGIN());
          return;
        }
        if (user.authenticationMethod !== 'local') {
          window.location.replace(PATHS.CONNECTIONS());
          return;
        }
        setMustChangePassword(user.mustChangePassword);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) window.location.replace(PATHS.LOGIN());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changePassword = async (values: PasswordChangeValues) => {
    setLoading(true);
    setError(undefined);
    try {
      await API.auth.changeLocalPassword({ currentPassword: values.currentPassword, password: values.password });
      window.location.assign(PATHS.CONNECTIONS());
    } catch {
      setError(COPY.failed);
    } finally {
      setLoading(false);
    }
  };

  if (!ready) return null;

  return (
    <AuthLayout title={COPY.heading}>
      <Notices>
        {mustChangePassword && <Alert type="info" title={COPY.forcedNotice} />}
        {error && <Alert type="error" title={error} />}
      </Notices>
      <Form<PasswordChangeValues> layout="vertical" onFinish={changePassword} requiredMark={false}>
        {!mustChangePassword && (
          <Form.Item
            label={COPY.currentLabel}
            name="currentPassword"
            rules={[{ required: true, message: COPY.currentRequired }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
        )}
        <Form.Item
          label={COPY.newLabel}
          name="password"
          rules={[{ required: true, min: MIN_PASSWORD_LENGTH, message: COPY.tooShort }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          label={COPY.confirmLabel}
          name="confirmPassword"
          dependencies={['password']}
          rules={[
            { required: true, message: COPY.confirmRequired },
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                !value || getFieldValue('password') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error(COPY.mismatch)),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <ActionButton type="primary" htmlType="submit" block loading={loading}>
          {COPY.submit}
        </ActionButton>
      </Form>
    </AuthLayout>
  );
};
