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

// App copy that page objects reuse; this depth keeps the relative path short.
export { COPY as UI_KIT_COPY } from '../../src/routes/ui-kit/constants';
export { COPY as LAYOUT_COPY, THEME_LABEL } from '../../src/routes/layout/constants';
export { COPY as SIDEBAR_COPY } from '../../src/ui/sidebar-nav/constants';
export { COPY as ACCOUNT_BLOCK_COPY } from '../../src/ui/account-block/constants';
export { COMMON_COPY } from '../../src/ui/constants';
export { PROJECT_TAB } from '../../src/config/route-keys';
export { COPY as CONNECTIONS_COPY, CATALOG_FILTER } from '../../src/routes/connection/constants';
export { COPY as INTEGRATION_CARD_COPY } from '../../src/ui/integration-card/constants';
export { HEALTH_STORAGE_KEY, HEALTH_TTL_MS } from '../../src/features/connections/constants';
export { INTEGRATION_CATEGORY } from '../../src/plugins/catalog';
export { COPY as API_KEYS_COPY } from '../../src/routes/api-keys/constants';
export { COPY as PROJECT_HOME_COPY } from '../../src/routes/project/home/constants';
export {
  COPY as BLUEPRINT_HOME_COPY,
  STATUS_FILTER as BLUEPRINT_STATUS_FILTER,
} from '../../src/routes/blueprint/home/constants';
export { COPY as PIPELINE_COPY } from '../../src/routes/pipeline/constants';
export { COPY as SETTINGS_COPY } from '../../src/routes/settings/constants';
export { COPY as AUTH_COPY } from '../../src/routes/settings/authentication/constants';
export { COPY as ACTIVITY_COPY } from '../../src/routes/settings/activity/constants';
export { COPY as SORT_SELECT_COPY } from '../../src/ui/sort-select/constants';
