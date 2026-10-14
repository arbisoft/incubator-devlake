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

import { useCallback, useRef, useState } from 'react';

export const usePendingRoles = () => {
  const active = useRef(new Set<string>());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  const beginRoleChange = useCallback((key: string): boolean => {
    if (active.current.has(key)) return false;
    active.current.add(key);
    setPending(new Set(active.current));
    return true;
  }, []);

  const endRoleChange = useCallback((key: string) => {
    active.current.delete(key);
    setPending(new Set(active.current));
  }, []);

  const isRolePending = useCallback((key: string): boolean => pending.has(key), [pending]);

  return { beginRoleChange, endRoleChange, isRolePending };
};
