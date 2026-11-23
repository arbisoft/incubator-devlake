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

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ConnectionFieldErrors } from '@/types';

import { COPY } from '../constants';

import { useFieldError } from './use-field-error';

const ROLE_ARN_REQUIRED = COPY.credentials.roleArn.required;

describe('plugins/register/aws/connection-fields/use-field-error', () => {
  it('reports the error again after the form clears its errors', () => {
    const setErrors = vi.fn();
    const { rerender } = renderHook(
      ({ errors }: { errors: ConnectionFieldErrors }) => useFieldError('roleArn', ROLE_ARN_REQUIRED, errors, setErrors),
      { initialProps: { errors: {} } },
    );
    expect(setErrors).toHaveBeenLastCalledWith({ roleArn: ROLE_ARN_REQUIRED });

    rerender({ errors: { roleArn: ROLE_ARN_REQUIRED } });
    expect(setErrors).toHaveBeenCalledTimes(1);

    rerender({ errors: {} });
    expect(setErrors).toHaveBeenCalledTimes(2);
  });
});
