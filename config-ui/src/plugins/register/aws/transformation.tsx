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

import { Input } from 'antd';
import { useEffect } from 'react';

import type { TransformationProps } from '@/plugins/components/scope-config-form/types';
import { FormField, SectionCard } from '@/ui';

import { COPY, TRANSFORMATION_FIELDS, TRANSFORMATION_GROUPS } from './constants';
import { isValidPattern } from './patterns';
import { ErrorText, Stack } from './styled';
import type { AwsTransformationValues } from './types';

type PatternFieldProps = {
  label: string;
  help: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
};

const PatternField = ({ label, help, value, invalid, onChange }: PatternFieldProps) => (
  <FormField label={label} description={help}>
    {(control) => (
      <>
        <Input
          {...control}
          value={value}
          status={invalid ? 'error' : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {invalid && <ErrorText role="alert">{COPY.transformation.invalidPattern}</ErrorText>}
      </>
    )}
  </FormField>
);

export const AwsTransformation = ({
  transformation,
  setTransformation,
  setHasError,
}: TransformationProps<AwsTransformationValues>) => {
  const invalidKeys = TRANSFORMATION_FIELDS.filter(({ key }) => !isValidPattern(transformation[key] ?? '')).map(
    ({ key }) => key,
  );
  const hasError = invalidKeys.length > 0;

  useEffect(() => {
    setHasError(hasError);
  }, [hasError, setHasError]);

  return (
    <Stack>
      {TRANSFORMATION_GROUPS.map((group) => (
        <SectionCard key={group.key} title={group.title} description={group.description}>
          <Stack>
            {TRANSFORMATION_FIELDS.filter((field) => field.group === group.key).map(({ key, label, help }) => (
              <PatternField
                key={key}
                label={label}
                help={help}
                value={transformation[key] ?? ''}
                invalid={invalidKeys.includes(key)}
                onChange={(value) => setTransformation((prev) => ({ ...prev, [key]: value }))}
              />
            ))}
          </Stack>
        </SectionCard>
      ))}
    </Stack>
  );
};
