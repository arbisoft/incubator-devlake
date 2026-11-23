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

import { Alert, Button, Spin } from 'antd';

import API from '@/api';
import { useRefreshData } from '@/hooks';
import { COMMON_COPY, useRefreshVersion } from '@/ui';

import { AWS_AUTH_TYPE, COPY } from '../constants';
import type { AwsSectionProps } from '../types';

import { SetupDetails } from './setup-details';

const SetupPanel = ({ connectionId }: { connectionId: ID }) => {
  const { version, refresh } = useRefreshVersion();
  const { data, error } = useRefreshData(
    (signal) => API.plugin.aws.setup(connectionId, signal),
    [connectionId, version],
  );

  if (error !== undefined) {
    return (
      <Alert
        type="error"
        showIcon
        title={COPY.setup.loadFailed}
        action={
          <Button type="link" onClick={refresh}>
            {COMMON_COPY.retry}
          </Button>
        }
      />
    );
  }
  return data ? <SetupDetails setup={data} /> : <Spin />;
};

export const SetupSection = ({ connectionId, values, initialValues }: AwsSectionProps) =>
  connectionId === undefined ? (
    <Alert
      type="info"
      showIcon
      title={COPY.setup.createInfo[values.authType ?? initialValues.authType ?? AWS_AUTH_TYPE.ASSUME_ROLE]}
    />
  ) : (
    <SetupPanel connectionId={connectionId} />
  );
