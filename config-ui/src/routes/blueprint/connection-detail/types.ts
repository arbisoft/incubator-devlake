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

import type { IBlueprint } from '@/types';

import type { FOLLOW_UP } from './constants';

export type FollowUpKind = (typeof FOLLOW_UP)[keyof typeof FOLLOW_UP];

export type ConnectionRef = { plugin: string; connectionId: number };

export type DetailScope = { pname?: string; blueprintId: ID };

export type DetailRoutes = { status: string; configuration: string; connection: string };

export type ConnectionDetailData = { blueprint: IBlueprint; connectionName: string };

export type ConnectionDetailViewProps = ConnectionDetailData &
  ConnectionRef & {
    pname?: string;
    onChanged: () => void;
  };
