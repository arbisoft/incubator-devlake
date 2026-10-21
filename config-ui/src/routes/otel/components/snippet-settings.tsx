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

import { useMemo, useState } from 'react';

import { CODE_LANGUAGE, CodeBlock } from '@/ui';

import { buildManagedSettings, DEFAULT_SETTINGS_SELECTION } from '../managed-settings';
import { Hint } from '../styled';
import type { SnippetSettingsProps } from '../types';

import { COPY } from './constants';
import { SettingsOptions } from './settings-options';

export const SnippetSettings = ({ managedSettings, rotation }: SnippetSettingsProps) => {
  const [selection, setSelection] = useState(DEFAULT_SETTINGS_SELECTION);
  const settings = useMemo(() => buildManagedSettings(managedSettings, selection), [managedSettings, selection]);

  return (
    <>
      {rotation && <Hint>{COPY.snippet.options.rotateNotice}</Hint>}
      <SettingsOptions value={selection} onChange={setSelection} />
      <CodeBlock value={settings} language={CODE_LANGUAGE.JSON} copyLabel={COPY.snippet.copy} />
    </>
  );
};
