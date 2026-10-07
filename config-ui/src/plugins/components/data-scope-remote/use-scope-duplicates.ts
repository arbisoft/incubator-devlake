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

import { useEffect, useMemo, useState } from 'react';

import API from '@/api';
import type { ScopeDuplicateGroup } from '@/api/scope';

import { SCOPE_DUPLICATE_FIELDS } from './constants';
import type { ScopeItem } from './types';
import { buildDuplicateWarning, getScopeDuplicateId } from './utils';

type DuplicateResult = { key: string; duplicates: ScopeDuplicateGroup[] };

export const useScopeDuplicates = (plugin: string, connectionId: ID, selectedScope: ScopeItem[]) => {
  const [result, setResult] = useState<DuplicateResult>({ key: '', duplicates: [] });
  const [dismissedKey, setDismissedKey] = useState('');

  const duplicateFields = SCOPE_DUPLICATE_FIELDS[plugin];

  const idsKey = useMemo(() => {
    if (!duplicateFields) {
      return '';
    }
    return selectedScope
      .map((it) => getScopeDuplicateId(plugin, it))
      .filter((id): id is string => id !== undefined)
      .sort()
      .join(',');
  }, [plugin, duplicateFields, selectedScope]);

  useEffect(() => {
    if (!duplicateFields || !idsKey) return undefined;
    let cancelled = false;

    API.scope
      .scopeDuplicates(plugin, {
        connectionId,
        idsParam: duplicateFields.queryParam,
        ids: idsKey,
      })
      .then((res) => !cancelled && setResult({ key: idsKey, duplicates: res.duplicates ?? [] }))
      .catch(() => !cancelled && setResult({ key: idsKey, duplicates: [] }));

    return () => {
      cancelled = true;
    };
  }, [plugin, connectionId, duplicateFields, idsKey]);

  const visible = !!idsKey && result.key === idsKey && result.duplicates.length > 0 && dismissedKey !== idsKey;

  return {
    warning: visible ? buildDuplicateWarning(result.duplicates) : undefined,
    dismiss: () => setDismissedKey(idsKey),
  };
};
