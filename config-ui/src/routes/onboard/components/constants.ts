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

export const ONBOARD_STATUS = {
  PREPARE: 'prepare',
  RUNNING: 'running',
  SUCCESS: 'success',
  PARTIAL: 'partial',
  FAILED: 'failed',
} as const;

export const BANNER_ACTION = {
  CONTINUE: 'continue',
  DETAILS: 'details',
  DASHBOARD: 'dashboard',
  FINISH: 'finish',
} as const;

export const TASK_STATUS = {
  COMPLETED: 'TASK_COMPLETED',
  PARTIAL: 'TASK_PARTIAL',
  FAILED: 'TASK_FAILED',
  RUNNING: 'TASK_RUNNING',
} as const;

export const FINAL_TASK_STATUSES: string[] = [TASK_STATUS.COMPLETED, TASK_STATUS.PARTIAL, TASK_STATUS.FAILED];

export const STORE_KEY = 'onboard';
export const TOTAL_STEPS = 3;
export const ONBOARD_DONE_STEP = 4;

export const COPY = {
  title: 'Onboarding Session',
  messages: {
    [ONBOARD_STATUS.PREPARE]: 'You are not far from connecting to your first tool. Continue to finish it.',
    [ONBOARD_STATUS.RUNNING]: 'You are not far from connecting to your first tool. Continue to finish it.',
    [ONBOARD_STATUS.SUCCESS]: 'The data of your first tool has been collected. Please check it out.',
    [ONBOARD_STATUS.PARTIAL]: 'The data of your first tool has been partly collected. Please check it out.',
    [ONBOARD_STATUS.FAILED]: 'Something went wrong with the collection process.',
  },
  actions: {
    [BANNER_ACTION.CONTINUE]: 'Continue',
    [BANNER_ACTION.DETAILS]: 'Details',
    [BANNER_ACTION.DASHBOARD]: 'Check Dashboard',
    [BANNER_ACTION.FINISH]: 'Finish',
  },
  confirm: {
    title: 'Permanently close this entry?',
    description: 'You will not be able to get back to the onboarding session again.',
    confirm: 'Confirm',
  },
} as const;
