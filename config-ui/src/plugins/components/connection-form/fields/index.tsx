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

import { Fragment, type Dispatch, type SetStateAction } from 'react';

import type { ConnectionField, ConnectionFieldErrors, ConnectionFieldOptions, ConnectionFieldValues } from '@/types';

import { ConnectionAppId } from './app-id';
import { ConnectionEndpoint } from './endpoint';
import { ConnectionName } from './name';
import { ConnectionPassword } from './password';
import { ConnectionProxy } from './proxy';
import { ConnectionRateLimit } from './rate-limit';
import { ConnectionSecretKey } from './secret-key';
import { ConnectionToken } from './token';
import { ConnectionUsername } from './username';

type OptionProps = Partial<Omit<ConnectionFieldOptions, 'key' | 'type' | 'defaultValue'>> & { defaultValue?: number };

type Props = {
  type: 'create' | 'update';
  connectionId?: ID;
  name: string;
  fields: ConnectionField[];
  initialValues: ConnectionFieldValues;
  values: ConnectionFieldValues;
  errors: ConnectionFieldErrors;
  setValues: Dispatch<SetStateAction<ConnectionFieldValues>>;
  setErrors: Dispatch<SetStateAction<ConnectionFieldErrors>>;
};

const omitFormProps = ({ key: _key, type: _type, ...rest }: ConnectionFieldOptions) => rest;

// function fields are static config, so their identity is a stable React key
type FieldRenderer = Extract<ConnectionField, (...args: never[]) => unknown>;

const fieldIds = new WeakMap<FieldRenderer, string>();
let nextFieldId = 0;

const fieldIdOf = (field: FieldRenderer) => {
  const known = fieldIds.get(field);
  if (known) return known;
  nextFieldId += 1;
  const id = `field-${nextFieldId}`;
  fieldIds.set(field, id);
  return id;
};

// the caller states the expected type; a missing key falls back to the default
const readKey = <T,>(source: Record<string, unknown> | undefined, key: string, fallback: unknown) =>
  (source?.[key] ?? fallback) as T;

export const Form = ({
  type,
  connectionId,
  name,
  fields,
  initialValues,
  values,
  errors,
  setValues,
  setErrors,
}: Props) => {
  const onValues = (values: ConnectionFieldValues) => setValues((prev) => ({ ...prev, ...values }));
  const onErrors = (values: ConnectionFieldErrors) => setErrors((prev) => ({ ...prev, ...values }));

  const getProps = <D extends string | number>(key: string, defaultValue: D) => {
    return {
      name,
      initialValue: readKey<D>(initialValues, key, defaultValue),
      value: readKey<D>(values, key, defaultValue),
      error: readKey<string>(errors, key, defaultValue),
      setValue: (value: D | undefined) => onValues({ [key]: value }),
      setError: (value?: string) => onErrors({ [key]: value }),
    };
  };

  const generateForm = () => {
    return fields.map((field) => {
      if (typeof field === 'function') {
        return (
          <Fragment key={fieldIdOf(field)}>
            {field({
              type,
              connectionId,
              initialValues,
              values,
              setValues: onValues,
              errors,
              setErrors: onErrors,
            })}
          </Fragment>
        );
      }

      const key = typeof field === 'string' ? field : field.key;
      // key and type belong to the form; string defaults are left untyped
      const options = (typeof field === 'string' ? {} : omitFormProps(field)) as OptionProps;

      switch (key) {
        case 'name':
          return <ConnectionName key={key} {...getProps<string>('name', '')} {...options} />;
        case 'endpoint':
          return <ConnectionEndpoint key={key} {...getProps<string>('endpoint', '')} {...options} />;
        case 'username':
          return <ConnectionUsername key={key} {...getProps<string>('username', '')} {...options} />;
        case 'password':
          return <ConnectionPassword key={key} type={type} {...getProps<string>('password', '')} {...options} />;
        case 'token':
          return <ConnectionToken key={key} type={type} {...getProps<string>('token', '')} {...options} />;
        case 'appId':
          return <ConnectionAppId key={key} {...getProps<string>('appId', '')} {...options} />;
        case 'secretKey':
          return <ConnectionSecretKey key={key} type={type} {...getProps<string>('secretKey', '')} {...options} />;
        case 'proxy':
          return <ConnectionProxy key={key} {...getProps<string>('proxy', '')} {...options} />;
        case 'rateLimitPerHour':
          return <ConnectionRateLimit key={key} {...getProps<number>('rateLimitPerHour', 0)} {...options} />;
        default:
          return null;
      }
    });
  };

  return <div>{generateForm()}</div>;
};
