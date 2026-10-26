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
import type { ConnectionFieldRenderProps } from '@/types';

import type { ClaudeCodeConnectionValues } from '../types';

type Props = Pick<
  ConnectionFieldRenderProps<ClaudeCodeConnectionValues>,
  'type' | 'initialValues' | 'values' | 'setValues' | 'setErrors'
>;

const validate = (values: ClaudeCodeConnectionValues) =>
  values.organization?.trim() ? '' : 'Anthropic Organization ID is required';

export const Organization = ({ initialValues, values, setValues, setErrors }: Props) => (
  <IdentityField<ClaudeCodeConnectionValues>
    fieldKey="organization"
    errorKey="organization"
    title="Anthropic Organization"
    description="Enter the Anthropic organization from your Anthropic admin settings. DevLake uses it to scope Claude Code usage reporting."
    placeholder="e.g. org_123456789"
    required
    validate={validate}
    initialValues={initialValues}
    values={values}
    setValues={setValues}
    setErrors={setErrors}
  />
);
