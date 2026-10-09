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

import { STATUS_TONE } from '@/ui';

import { BANNER_ACTION, COPY, ONBOARD_DONE_STEP, ONBOARD_STATUS, TASK_STATUS, TOTAL_STEPS } from './constants';
import type { BannerModel, OnboardStatus } from './types';

export const getOnboardStatus = (step: number | undefined, taskStatus: string | undefined): OnboardStatus => {
  if (step !== ONBOARD_DONE_STEP) return ONBOARD_STATUS.PREPARE;

  switch (taskStatus) {
    case TASK_STATUS.COMPLETED:
      return ONBOARD_STATUS.SUCCESS;
    case TASK_STATUS.PARTIAL:
      return ONBOARD_STATUS.PARTIAL;
    case TASK_STATUS.FAILED:
      return ONBOARD_STATUS.FAILED;
    default:
      return ONBOARD_STATUS.RUNNING;
  }
};

const BANNER_BY_STATUS: Record<OnboardStatus, Omit<BannerModel, 'title' | 'message'>> = {
  [ONBOARD_STATUS.PREPARE]: { tone: STATUS_TONE.NEUTRAL, loading: false, primary: BANNER_ACTION.CONTINUE },
  [ONBOARD_STATUS.RUNNING]: { tone: STATUS_TONE.NEUTRAL, loading: true, primary: BANNER_ACTION.DETAILS },
  [ONBOARD_STATUS.SUCCESS]: {
    tone: STATUS_TONE.SUCCESS,
    loading: false,
    primary: BANNER_ACTION.DASHBOARD,
    secondary: BANNER_ACTION.FINISH,
  },
  [ONBOARD_STATUS.PARTIAL]: {
    tone: STATUS_TONE.WARNING,
    loading: false,
    primary: BANNER_ACTION.DETAILS,
    secondary: BANNER_ACTION.DASHBOARD,
  },
  [ONBOARD_STATUS.FAILED]: { tone: STATUS_TONE.ERROR, loading: false, primary: BANNER_ACTION.DETAILS },
};

export const getBannerModel = (status: OnboardStatus, step: number): BannerModel => ({
  ...BANNER_BY_STATUS[status],
  title: COPY.title,
  message: COPY.messages[status],
  progress: status === ONBOARD_STATUS.PREPARE ? { done: step, total: TOTAL_STEPS } : undefined,
});
