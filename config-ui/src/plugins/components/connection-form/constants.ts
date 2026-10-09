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

export const CONNECTION_FORM_TYPE = { CREATE: 'create', UPDATE: 'update' } as const;

export const COPY = {
  docHint: (name: string) => `If you run into any problems while creating a new connection for ${name},`,
  docLink: 'check out this doc',
  test: { label: 'Test Connection', success: 'Test Connection Successfully.' },
  save: {
    label: 'Save Connection',
    created: 'Create a New Connection Successful.',
    updated: 'Update Connection Successful.',
    failed: 'Could not save the connection. Check the fields and try again.',
    invalid: 'The connection was rejected. Check the fields and try again.',
    duplicate: 'A connection with this name already exists.',
  },
};

export const SAVE_ERROR_MAP: Record<string, string> = {
  '400': COPY.save.invalid,
  '409': COPY.save.duplicate,
};
