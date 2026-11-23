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

import { ConnectionPassword } from '@/plugins/components/connection-form/fields/password';
import { FormField } from '@/ui';

import { AWS_AUTH_TYPE, COPY } from '../constants';
import { ErrorText } from '../styled';
import type { AwsSectionProps } from '../types';

import { useFieldError } from './use-field-error';

const { credentials } = COPY;

export const CredentialsSection = ({ type, initialValues, values, errors, setValues, setErrors }: AwsSectionProps) => {
  const isUpdate = type === 'update';
  const authType = values.authType ?? initialValues.authType ?? AWS_AUTH_TYPE.ASSUME_ROLE;
  const isAssumeRole = authType === AWS_AUTH_TYPE.ASSUME_ROLE;
  const accessKeyId = values.accessKeyId ?? initialValues.accessKeyId ?? '';
  const roleArn = values.roleArn ?? initialValues.roleArn ?? '';
  const roleArnError = isAssumeRole && isUpdate && !roleArn ? credentials.roleArn.required : '';

  useFieldError('accessKeyId', isUpdate || accessKeyId ? '' : credentials.accessKeyIdRequired, errors, setErrors);
  useFieldError('roleArn', roleArnError, errors, setErrors);

  return (
    <>
      <FormField
        label={credentials.accessKeyId[authType].label}
        description={credentials.accessKeyId[authType].help}
        required
      >
        {(control) => (
          <Input
            {...control}
            placeholder={credentials.accessKeyPlaceholder}
            value={accessKeyId}
            onChange={(event) => setValues({ accessKeyId: event.target.value.trim() })}
          />
        )}
      </FormField>
      <ConnectionPassword
        type={type}
        label={credentials.secretAccessKey[authType].label}
        subLabel={credentials.secretAccessKey[authType].help}
        placeholder={credentials.secretPlaceholder}
        initialValue=""
        value={values.secretAccessKey ?? ''}
        error={String(errors.secretAccessKey ?? '')}
        setValue={(secretAccessKey) => setValues({ secretAccessKey })}
        setError={(error) => setErrors({ secretAccessKey: error })}
      />
      {isAssumeRole ? (
        <FormField label={credentials.roleArn.label} description={credentials.roleArn.help} required={isUpdate}>
          {(control) => (
            <>
              <Input
                {...control}
                placeholder={credentials.rolePlaceholder}
                value={roleArn}
                status={roleArnError ? 'error' : undefined}
                onChange={(event) => setValues({ roleArn: event.target.value.trim() })}
              />
              {roleArnError && <ErrorText role="alert">{roleArnError}</ErrorText>}
            </>
          )}
        </FormField>
      ) : (
        <FormField label={credentials.sessionToken.label} description={credentials.sessionToken.help}>
          {(control) => (
            <Input.Password
              {...control}
              placeholder={isUpdate ? credentials.maskedPlaceholder : undefined}
              value={values.sessionToken ?? ''}
              onChange={(event) => setValues({ sessionToken: event.target.value })}
            />
          )}
        </FormField>
      )}
    </>
  );
};
