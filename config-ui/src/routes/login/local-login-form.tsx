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

import { Form, Input } from 'antd';

import { COPY } from './constants';
import { ActionButton, Fields } from './styled';
import type { LocalLoginValues } from './types';

type LocalLoginFormProps = {
  pending: boolean;
  onSubmit: (values: LocalLoginValues) => void;
};

export const LocalLoginForm = ({ pending, onSubmit }: LocalLoginFormProps) => (
  <Fields>
    <Form<LocalLoginValues> layout="vertical" onFinish={onSubmit} requiredMark={false}>
      <Form.Item
        label={COPY.usernameLabel}
        name="loginName"
        rules={[{ required: true, message: COPY.usernameRequired }]}
      >
        <Input autoComplete="username" />
      </Form.Item>
      <Form.Item
        label={COPY.passwordLabel}
        name="password"
        extra={COPY.passwordHelp}
        rules={[{ required: true, message: COPY.passwordRequired }]}
      >
        <Input.Password autoComplete="current-password" />
      </Form.Item>
      <ActionButton type="primary" htmlType="submit" block loading={pending}>
        {COPY.submit}
      </ActionButton>
    </Form>
  </Fields>
);
