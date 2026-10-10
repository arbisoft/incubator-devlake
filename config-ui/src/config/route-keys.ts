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

export const PROJECT_TAB = {
  BLUEPRINT: 'blueprint',
  WEBHOOKS: 'webhooks',
  CLAUDE_CODE_OTEL: 'claude-code-otel',
  SETTINGS: 'settings',
} as const;

export const BLUEPRINT_VIEW = {
  STATUS: 'status',
  CONFIGURATION: 'configuration',
} as const;

export const USER_MANAGEMENT_VIEW = {
  DEVLAKE: 'devlake',
  GRAFANA: 'grafana',
} as const;
