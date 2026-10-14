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

import { Tour } from 'antd';

import API from '@/api';
import { useRefreshData } from '@/hooks';

import { COPY } from '../constants';

import { ONBOARD_DONE_STEP, STORE_KEY } from './constants';
import type { OnboardStore } from './types';

interface Props {
  nameRef: React.RefObject<HTMLAnchorElement | null>;
  connectionRef: React.RefObject<HTMLButtonElement | null>;
  configRef: React.RefObject<HTMLAnchorElement | HTMLButtonElement | null>;
}

export const OnboardTour = ({ nameRef, connectionRef, configRef }: Props) => {
  const { ready, data } = useRefreshData<OnboardStore | null>(() => API.store.get(STORE_KEY), []);

  const steps = [
    {
      ...COPY.tour.project,
      target: nameRef.current,
    },
    {
      ...COPY.tour.connection,
      target: connectionRef.current,
    },
    {
      ...COPY.tour.configure,
      target: configRef.current,
    },
  ];

  if (!ready || !data || data.step !== ONBOARD_DONE_STEP || data.done) {
    return null;
  }

  return <Tour steps={steps} />;
};
