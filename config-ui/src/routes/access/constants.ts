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

export const PATH_PREFIX = import.meta.env.DEVLAKE_PATH_PREFIX ?? '';
export const ACCESS_PATH = `${PATH_PREFIX}/access`;
export const PAGE_SIZE_OPTIONS: Array<10 | 25 | 50> = [10, 25, 50];
export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

export const ACCESS_STATUS_COLOR = {
  active: 'green',
  disabled: 'default',
} as const;
