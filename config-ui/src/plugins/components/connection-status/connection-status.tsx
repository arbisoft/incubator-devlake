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

import { selectHealth, testConnection, toHealthView, toTestErrorMessage } from '@/features/connections';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { IConnectionStatus, type IConnection } from '@/types';
import { ConnectionHealth } from '@/ui';
import { operator } from '@/utils';

type ConnectionStatusProps = {
  connection: IConnection;
};

export const ConnectionStatus = ({ connection }: ConnectionStatusProps) => {
  const dispatch = useAppDispatch();
  const entry = useAppSelector(selectHealth)[connection.unique];

  const retest = () =>
    operator(() => dispatch(testConnection(connection)).unwrap(), { formatReason: toTestErrorMessage });

  return (
    <ConnectionHealth
      {...toHealthView(entry)}
      testing={connection.status === IConnectionStatus.TESTING}
      onRetest={retest}
    />
  );
};
