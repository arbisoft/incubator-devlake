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

import { useState } from 'react';

import API from '@/api';
import { toUserMessage } from '@/ui/utils';
import { operator } from '@/utils';

import { COPY, RERUN_ERROR_MAP } from './constants';

export const usePipelineActions = (id: ID, onDone: () => void) => {
  const [operating, setOperating] = useState(false);

  const cancel = async () => {
    const [success] = await operator(() => API.pipeline.remove(id), {
      setOperating,
      formatMessage: () => COPY.actions.cancelled,
      formatReason: (error) => toUserMessage(error, {}, COPY.actions.cancelFailed),
    });
    if (success) onDone();
  };

  const rerun = async () => {
    const [success] = await operator(() => API.pipeline.rerun(id), {
      setOperating,
      formatMessage: () => COPY.actions.rerunStarted,
      formatReason: (error) => toUserMessage(error, RERUN_ERROR_MAP, COPY.actions.rerunFailed),
    });
    if (success) onDone();
  };

  return { operating, cancel, rerun };
};
