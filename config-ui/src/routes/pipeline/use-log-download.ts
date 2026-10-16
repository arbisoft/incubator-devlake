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

import { usePendingKeys } from '@/ui/hooks';
import { toUserMessage } from '@/ui/utils';
import { operator } from '@/utils';

import { COPY, LOG_DOWNLOAD_ERROR_MAP } from './constants';
import { downloadPipelineLogs } from './download-logs';

export const useLogDownload = () => {
  const { begin, end, isPending } = usePendingKeys();

  const download = useCallback(
    async (id: ID): Promise<void> => {
      const key = String(id);
      if (!begin(key)) return;

      try {
        const [success, error] = await operator(() => downloadPipelineLogs(id), { hideToast: true });
        if (!success) {
          message.error(toUserMessage(error, LOG_DOWNLOAD_ERROR_MAP, COPY.actions.downloadFailed));
        }
      } finally {
        end(key);
      }
    },
    [begin, end],
  );

  const isDownloading = useCallback((id: ID) => isPending(String(id)), [isPending]);

  return { download, isDownloading };
};
