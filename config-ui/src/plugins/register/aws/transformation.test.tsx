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

import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { AwsConfig } from './config';
import { COPY, DEFAULT_PATTERNS, TRANSFORMATION_FIELDS } from './constants';
import { AwsTransformation } from './transformation';
import type { AwsTransformationValues } from './types';

const Harness = ({ setHasError }: { setHasError: (hasError: boolean) => void }) => {
  const [transformation, setTransformation] = useState<AwsTransformationValues>({ ...DEFAULT_PATTERNS });
  return (
    <AwsTransformation
      entities={['CICD']}
      connectionId={1}
      transformation={transformation}
      setTransformation={setTransformation}
      setHasError={setHasError}
    />
  );
};

describe('plugins/register/aws/transformation', () => {
  it('registers the defaults as the scope config transformation', () => {
    expect(AwsConfig.scopeConfig?.transformation).toStrictEqual(DEFAULT_PATTERNS);
  });

  it.each(TRANSFORMATION_FIELDS)('shows the default of $label and its help', ({ key, label }) => {
    renderWithTheme(<Harness setHasError={vi.fn()} />);

    expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(DEFAULT_PATTERNS[key]);
  });

  it('flags an invalid pattern, reports the error and clears it once fixed', () => {
    const setHasError = vi.fn();
    renderWithTheme(<Harness setHasError={setHasError} />);
    expect(setHasError).toHaveBeenLastCalledWith(false);

    fireEvent.change(screen.getByLabelText('Deployment'), { target: { value: '(unclosed' } });

    expect(screen.getByRole('alert').textContent).toBe(COPY.transformation.invalidPattern);
    expect(setHasError).toHaveBeenLastCalledWith(true);

    fireEvent.change(screen.getByLabelText('Deployment'), { target: { value: '(?i)deploy' } });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(setHasError).toHaveBeenLastCalledWith(false);
  });
});
