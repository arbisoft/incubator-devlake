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

import { Block } from '@/components';
import type { ConnectionFieldRenderProps } from '@/types';
import { trimTrailingSlashes } from '@/utils';

import type { YouTrackConnectionValues } from '../types';

const endpointExample = 'https://example.myjetbrains.com/youtrack/api';

const invalidMessage = `endpoint must be the full API base URL ending in /api — e.g. ${endpointExample}`;

// validateEndpoint mirrors the backend rule: after trimming trailing slashes,
// the URL must be absolute http(s) with a path ending in `/api`. The endpoint
// is never inferred from the hostname — self-hosted shapes are unconstrained.
export const validateEndpoint = (endpoint: string): string => {
  if (!endpoint) {
    return 'endpoint is required';
  }
  const normalized = trimTrailingSlashes(endpoint);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return invalidMessage;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return invalidMessage;
  }
  if (!url.pathname.endsWith('/api')) {
    return invalidMessage;
  }
  return '';
};

type Props = Pick<
  ConnectionFieldRenderProps<YouTrackConnectionValues>,
  'type' | 'initialValues' | 'values' | 'errors' | 'setValues' | 'setErrors'
>;

const endpointExamples = [
  {
    label: 'InCloud',
    url: 'https://example.myjetbrains.com/youtrack/api',
    note: (
      <>
        {' '}
        — note the <code>/youtrack</code> context path, the most common setup error
      </>
    ),
  },
  { label: 'YouTrack Cloud', url: 'https://example.youtrack.cloud/api' },
  {
    label: 'Self-hosted',
    url: 'https://youtrack.example.com/api',
    note: (
      <>
        , or your custom context path such as <code>https://www.example.com/youtrack/api</code>
      </>
    ),
  },
];

export const Endpoint = ({ initialValues, values, errors, setValues, setErrors }: Props) => {
  useEffect(() => {
    setValues({ endpoint: initialValues.endpoint ?? '' });
  }, [initialValues.endpoint]);

  useEffect(() => {
    setErrors({ endpoint: validateEndpoint(values.endpoint ?? '') });
  }, [values.endpoint]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues({ endpoint: e.target.value });
  };

  // like the built-in fields, an empty input only disables the buttons; a
  // malformed one also says why, with the canonical example
  const endpointError = typeof errors.endpoint === 'string' ? errors.endpoint : '';
  const showError = !!values.endpoint && !!endpointError;

  return (
    <Block
      title="Endpoint URL"
      description={
        <>
          The full API base URL of your YouTrack instance — it must end in <code>/api</code>:
          <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
            {endpointExamples.map(({ label, url, note }) => (
              <li key={label}>
                {label}: <code>{url}</code>
                {note}
              </li>
            ))}
          </ul>
        </>
      }
      required
    >
      <Input
        style={{ width: 480 }}
        status={showError ? 'error' : ''}
        placeholder={endpointExample}
        value={values.endpoint}
        onChange={handleChange}
      />
      {showError && <p style={{ margin: '4px 0 0', color: '#ff4d4f' }}>{endpointError}</p>}
    </Block>
  );
};
