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
import { useEffect, type ChangeEvent } from 'react';

import { Block } from '@/components';
import type { ConnectionFieldRenderProps, ConnectionFieldValues } from '@/types';

import * as S from './styled';

type Props<V extends ConnectionFieldValues> = {
  fieldKey: keyof V & string;
  errorKey: string;
  title: string;
  description: string;
  placeholder: string;
  required?: boolean;
  validate: (values: V) => string;
} & Pick<ConnectionFieldRenderProps<V>, 'initialValues' | 'values' | 'setValues' | 'setErrors'>;

export const IdentityField = <V extends ConnectionFieldValues>({
  fieldKey,
  errorKey,
  title,
  description,
  placeholder,
  required,
  validate,
  initialValues,
  values,
  setValues,
  setErrors,
}: Props<V>) => {
  useEffect(() => {
    setValues({ [fieldKey]: initialValues[fieldKey] ?? '' } as Partial<V>);
  }, [initialValues[fieldKey]]);

  const error = validate(values);

  useEffect(() => {
    setErrors({ [errorKey]: error });
  }, [error]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValues({ [fieldKey]: e.target.value } as Partial<V>);
  };

  return (
    <Block title={title} description={description} required={required}>
      <Input
        placeholder={placeholder}
        status={error ? 'error' : ''}
        value={(values[fieldKey] as string | undefined) ?? ''}
        onChange={handleChange}
      />
      {error && <S.ErrorText>{error}</S.ErrorText>}
    </Block>
  );
};
