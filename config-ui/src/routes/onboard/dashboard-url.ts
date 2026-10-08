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

import { ONBOARD_PLUGIN } from './constants';

export const DASHBOARD_URL: Record<string, string> = {
  [ONBOARD_PLUGIN.GITHUB]: import.meta.env.DEVLAKE_DASHBOARD_URL_GITHUB,
  [ONBOARD_PLUGIN.GITLAB]: import.meta.env.DEVLAKE_DASHBOARD_URL_GITLAB,
  [ONBOARD_PLUGIN.BITBUCKET]: import.meta.env.DEVLAKE_DASHBOARD_URL_BITBUCKET,
  [ONBOARD_PLUGIN.AZURE_DEVOPS]: import.meta.env.DEVLAKE_DASHBOARD_URL_AZUREDEVOPS,
  [ONBOARD_PLUGIN.ASANA]: import.meta.env.DEVLAKE_DASHBOARD_URL_ASANA,
};
