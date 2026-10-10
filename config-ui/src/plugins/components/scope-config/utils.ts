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

import type { ProjectRef, RelatedProject } from './types';

type CheckedProject = { name: string; scopes?: Array<{ scopeName: string }> };
type ScopeBlueprint = { id: ID; projectName: string };

export const toRelatedProjects = (projects: CheckedProject[] | undefined): RelatedProject[] =>
  (projects ?? []).map((it) => ({ name: it.name, scopes: it.scopes ?? [] }));

export const toProjectRefs = (blueprints: ScopeBlueprint[] | undefined): ProjectRef[] =>
  (blueprints ?? []).map((it) => ({ name: it.projectName, blueprintId: it.id }));

export const toCheckedProjectRefs = (projects: Array<{ name: string; blueprintId: ID }> | undefined): ProjectRef[] =>
  (projects ?? []).map((it) => ({ name: it.name, blueprintId: it.blueprintId }));
