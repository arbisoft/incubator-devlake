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

import type { ProgressBannerProps } from '@/ui';

import type { OnboardRecord } from '../types';

import type { BANNER_ACTION, ONBOARD_STATUS } from './constants';

export type OnboardStatus = (typeof ONBOARD_STATUS)[keyof typeof ONBOARD_STATUS];
export type BannerAction = (typeof BANNER_ACTION)[keyof typeof BANNER_ACTION];

export type OnboardStore = {
  step: number;
  done?: boolean;
  plugin: string;
  records: OnboardRecord[];
};

export type BannerModel = {
  title: string;
  message: string;
  tone: NonNullable<ProgressBannerProps['tone']>;
  loading: boolean;
  progress?: ProgressBannerProps['progress'];
  primary: BannerAction;
  secondary?: BannerAction;
};
