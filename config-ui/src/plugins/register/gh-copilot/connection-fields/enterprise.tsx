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

import { IdentityField } from '@/plugins/components/connection-form/fields/identity-field';

import type { GhCopilotConnectionValues } from '../types';

import { validateScopeIdentity, type ScopeIdentityProps } from './scope-identity';

export const Enterprise = ({ type, initialValues, values, setValues, setErrors }: ScopeIdentityProps) => (
  <IdentityField<GhCopilotConnectionValues>
    fieldKey="enterprise"
    errorKey="scopeIdentity"
    title="Enterprise Slug"
    description="Enter the GitHub enterprise slug for enterprise-wide aggregate metrics and per-user data. At least one of Organization or Enterprise Slug is required. For the most complete data, provide both."
    placeholder="e.g. my-enterprise"
    validate={(v) => validateScopeIdentity(type, v)}
    initialValues={initialValues}
    values={values}
    setValues={setValues}
    setErrors={setErrors}
  />
);
