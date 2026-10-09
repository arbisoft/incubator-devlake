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

import { describe, expect, it } from 'vitest';

import { STATUS_TONE } from '@/ui';

import { BANNER_ACTION, COPY, ONBOARD_DONE_STEP, ONBOARD_STATUS, TASK_STATUS, TOTAL_STEPS } from './constants';
import { getBannerModel, getOnboardStatus } from './utils';

describe('getOnboardStatus', () => {
  it('is prepare until the last step is reached, whatever the task says', () => {
    expect(getOnboardStatus(undefined, undefined)).toBe(ONBOARD_STATUS.PREPARE);
    expect(getOnboardStatus(1, TASK_STATUS.COMPLETED)).toBe(ONBOARD_STATUS.PREPARE);
  });

  it('is running at the last step without a task result or while the task runs', () => {
    expect(getOnboardStatus(ONBOARD_DONE_STEP, undefined)).toBe(ONBOARD_STATUS.RUNNING);
    expect(getOnboardStatus(ONBOARD_DONE_STEP, TASK_STATUS.RUNNING)).toBe(ONBOARD_STATUS.RUNNING);
    expect(getOnboardStatus(ONBOARD_DONE_STEP, 'TASK_CREATED')).toBe(ONBOARD_STATUS.RUNNING);
  });

  it('maps the final task statuses', () => {
    expect(getOnboardStatus(ONBOARD_DONE_STEP, TASK_STATUS.COMPLETED)).toBe(ONBOARD_STATUS.SUCCESS);
    expect(getOnboardStatus(ONBOARD_DONE_STEP, TASK_STATUS.PARTIAL)).toBe(ONBOARD_STATUS.PARTIAL);
    expect(getOnboardStatus(ONBOARD_DONE_STEP, TASK_STATUS.FAILED)).toBe(ONBOARD_STATUS.FAILED);
  });
});

describe('getBannerModel', () => {
  it('prepare shows the step counter and Continue', () => {
    expect(getBannerModel(ONBOARD_STATUS.PREPARE, 2)).toEqual({
      title: COPY.title,
      message: COPY.messages.prepare,
      tone: STATUS_TONE.NEUTRAL,
      loading: false,
      progress: { done: 2, total: TOTAL_STEPS },
      primary: BANNER_ACTION.CONTINUE,
    });
  });

  it('running shows a spinner and Details, without a counter', () => {
    const model = getBannerModel(ONBOARD_STATUS.RUNNING, ONBOARD_DONE_STEP);
    expect(model).toMatchObject({ loading: true, primary: BANNER_ACTION.DETAILS, message: COPY.messages.running });
    expect(model.progress).toBeUndefined();
    expect(model.secondary).toBeUndefined();
  });

  it('success offers the dashboard first and then Finish', () => {
    expect(getBannerModel(ONBOARD_STATUS.SUCCESS, ONBOARD_DONE_STEP)).toMatchObject({
      tone: STATUS_TONE.SUCCESS,
      loading: false,
      primary: BANNER_ACTION.DASHBOARD,
      secondary: BANNER_ACTION.FINISH,
    });
  });

  it('partial offers Details first and then the dashboard', () => {
    expect(getBannerModel(ONBOARD_STATUS.PARTIAL, ONBOARD_DONE_STEP)).toMatchObject({
      tone: STATUS_TONE.WARNING,
      primary: BANNER_ACTION.DETAILS,
      secondary: BANNER_ACTION.DASHBOARD,
    });
  });

  it('failed offers only Details', () => {
    const model = getBannerModel(ONBOARD_STATUS.FAILED, ONBOARD_DONE_STEP);
    expect(model).toMatchObject({
      tone: STATUS_TONE.ERROR,
      primary: BANNER_ACTION.DETAILS,
      message: COPY.messages.failed,
    });
    expect(model.secondary).toBeUndefined();
  });
});
