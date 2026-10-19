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

import { useCallback, useState } from 'react';

import type { ScopeRow, ScopeSelection } from './types';
import { pruneSelection } from './utils';

// The selection follows the rows on screen: ids that leave the page, or the result set, are dropped once loading ends.
export const useScopeSelection = (rows: ScopeRow[], ready: boolean): ScopeSelection & { clear: () => void } => {
  const [selectedIds, setSelectedIds] = useState<ID[]>([]);

  const pruned = ready ? pruneSelection(selectedIds, rows) : selectedIds;
  if (pruned !== selectedIds) setSelectedIds(pruned);

  const clear = useCallback(() => setSelectedIds([]), []);

  return { selectedIds: pruned, onChange: setSelectedIds, clear };
};
