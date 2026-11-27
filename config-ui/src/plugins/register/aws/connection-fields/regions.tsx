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

import { Select } from 'antd';
import { useState } from 'react';

import { FormField } from '@/ui';

import { COPY, REGION_OPTIONS, REGION_PATTERN } from '../constants';
import { ErrorText } from '../styled';
import type { AwsSectionProps } from '../types';

import { useFieldError } from './use-field-error';

const OPTIONS = REGION_OPTIONS.map((region) => ({ value: region, label: region }));
const TOKEN_SEPARATORS = [',', ' '];

const regionsError = (regions: string[]) => {
  if (regions.length === 0) return COPY.regions.required;
  const invalid = regions.find((region) => !REGION_PATTERN.test(region));
  return invalid === undefined ? '' : COPY.regions.invalid(invalid);
};

export const RegionsSection = ({ initialValues, values, errors, setValues, setErrors }: AwsSectionProps) => {
  const regions = values.regions ?? initialValues.regions ?? [];
  const error = regionsError(regions);
  const [touched, setTouched] = useState(false);
  // An empty list blocks Save at once, but is only called out after the user has edited the field.
  const shownError = regions.length === 0 && !touched ? '' : error;

  useFieldError('regions', error, errors, setErrors);

  return (
    <FormField label={COPY.regions.label} description={COPY.regions.help} required>
      {(control) => (
        <>
          <Select
            {...control}
            mode="tags"
            value={regions}
            options={OPTIONS}
            placeholder={COPY.regions.placeholder}
            tokenSeparators={TOKEN_SEPARATORS}
            status={shownError ? 'error' : undefined}
            onChange={(next: string[]) => {
              setTouched(true);
              setValues({ regions: next.map((region) => region.trim()) });
            }}
          />
          {shownError && <ErrorText role="alert">{shownError}</ErrorText>}
        </>
      )}
    </FormField>
  );
};
