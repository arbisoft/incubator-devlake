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

import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';

import API from '@/api';
import { TipLayout } from '@/components';
import { PATHS } from '@/config';

const { Title } = Typography;

type PasswordChangeValues = {
  currentPassword?: string;
  password: string;
  confirmPassword: string;
};

export const ChangePassword = () => {
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    API.auth.userinfo().then((user) => {
      if (!user.authenticated) {
        window.location.replace(PATHS.LOGIN());
        return;
      }
      setMustChangePassword(user.mustChangePassword);
    });
  }, []);

  const changePassword = async (values: PasswordChangeValues) => {
    setLoading(true);
    setError(undefined);
    try {
      await API.auth.changeLocalPassword({ currentPassword: values.currentPassword, password: values.password });
      window.location.assign(PATHS.CONNECTIONS());
    } catch {
      setError('Unable to change the password. Check the current password and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TipLayout>
      <Card style={{ maxWidth: 480, margin: '0 auto' }}>
        <Title level={3}>Change your password</Title>
        {mustChangePassword && (
          <Alert type="info" message="Choose a new password to continue." style={{ marginBottom: 16 }} />
        )}
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        <Form<PasswordChangeValues> layout="vertical" onFinish={changePassword} requiredMark={false}>
          {!mustChangePassword && (
            <Form.Item
              label="Current password"
              name="currentPassword"
              rules={[{ required: true, message: 'Enter your current password.' }]}
            >
              <Input.Password autoComplete="current-password" />
            </Form.Item>
          )}
          <Form.Item
            label="New password"
            name="password"
            rules={[{ required: true, min: 15, message: 'Use at least 15 characters.' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            label="Confirm new password"
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Confirm your new password.' },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || getFieldValue('password') === value
                    ? Promise.resolve()
                    : Promise.reject(new Error('Passwords do not match.')),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Change password
          </Button>
        </Form>
      </Card>
    </TipLayout>
  );
};
