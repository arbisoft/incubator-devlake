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

import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { FAILING_RESULT, PASSING_RESULT } from '../__tests__/fixtures';
import { COPY } from '../constants';

import { renderAwsTestResult } from '.';

const table = () => screen.getByRole('table', { name: COPY.testResult.ariaLabel });

describe('plugins/register/aws/test-result', () => {
  it('shows the account, the warnings and one row per check for a passing result', () => {
    renderWithTheme(<>{renderAwsTestResult(PASSING_RESULT)}</>);

    expect(screen.getByText(COPY.testResult.account('123456789012'))).toBeTruthy();
    expect(screen.getByText(PASSING_RESULT.warnings?.[0] ?? '')).toBeTruthy();
    expect(within(table()).getByText(COPY.testResult.status.allowed)).toBeTruthy();
    expect(within(table()).getByText(COPY.testResult.status.denied)).toBeTruthy();
  });

  it('summarises a failed result by region and keeps the status as text', () => {
    renderWithTheme(<>{renderAwsTestResult(FAILING_RESULT)}</>);

    expect(within(table()).getByText(COPY.testResult.noAccess('us-east-2', 'credentials failed'))).toBeTruthy();
    expect(within(table()).getByText(COPY.testResult.status.not_checked)).toBeTruthy();
    expect(screen.queryByText(COPY.testResult.warnings)).toBeNull();
    expect(screen.getByText(FAILING_RESULT.message)).toBeTruthy();
  });

  it('renders nothing for a response without checks', () => {
    const { container } = renderWithTheme(
      <>{renderAwsTestResult({ success: false, message: 'Enter the role ARN' })}</>,
    );

    expect(container.textContent).toBe('');
  });
});
