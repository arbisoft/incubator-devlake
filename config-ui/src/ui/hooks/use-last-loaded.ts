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

import { useState } from 'react';

// Keeps the last loaded value of the same scope on screen while a refetch is pending.
export const useLastLoaded = <T, S>(value: T | undefined, scope: S): T | undefined => {
  const [last, setLast] = useState<{ scope: S; value: T }>();

  if (value !== undefined && (last?.value !== value || last.scope !== scope)) {
    setLast({ scope, value });
  }

  return value ?? (last?.scope === scope ? last.value : undefined);
};
