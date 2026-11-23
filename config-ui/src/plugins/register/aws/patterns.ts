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

import { GO_INLINE_FLAGS, GO_NAMED_GROUP, JS_NAMED_GROUP } from './constants';

// The backend compiles patterns with Go's regexp, so Go-only syntax is rewritten before JavaScript checks the rest.
export const isValidPattern = (pattern: string): boolean => {
  const source = pattern.replace(GO_INLINE_FLAGS, '').replace(GO_NAMED_GROUP, JS_NAMED_GROUP);
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
};
