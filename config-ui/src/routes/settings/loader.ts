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

import { redirect } from 'react-router-dom';

import API from '@/api';
import type { AccessCurrent } from '@/api/access';
import { PATHS } from '@/config';

import { canManageAccess, canManageAdminFeatures } from './guard';

const guardLoader = (allowed: (access: AccessCurrent | null) => boolean) => async () => {
  const access = await API.access.current().catch(() => null);
  if (allowed(access)) {
    return null;
  }
  return redirect(PATHS.ROOT());
};

export const accessLoader = guardLoader(canManageAccess);

export const adminFeaturesLoader = guardLoader(canManageAdminFeatures);
