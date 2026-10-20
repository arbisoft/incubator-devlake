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

import { message } from 'antd';
import { useCallback } from 'react';

import { useConfirmFlow } from '@/ui/hooks';
import type { ConfirmConfig } from '@/ui/types';
import { operator } from '@/utils';

type Options<P, R> = {
  resolve: (pending: P) => { config?: ConfirmConfig; name: string };
  request: (pending: P) => Promise<R>;
  formatError: (error: unknown) => string;
  formatSuccess: (pending: P, result: R) => string;
  onSuccess: () => void;
};

export const useConfirmedMutation = <P, R>({
  resolve,
  request,
  formatError,
  formatSuccess,
  onSuccess,
}: Options<P, R>) => {
  const run = useCallback(
    async (pending: P, setLoading: (loading: boolean) => void) => {
      const [success, result] = await operator(() => request(pending), { setOperating: setLoading, hideToast: true });
      if (!success) {
        message.error(formatError(result));
        return false;
      }
      message.success(formatSuccess(pending, result));
      onSuccess();
      return true;
    },
    [request, formatError, formatSuccess, onSuccess],
  );

  return useConfirmFlow({ resolve, run });
};
