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

const encodedBackslash = /%5c/i;

// Keep browser-side navigation consistent with the backend's safeReturnURL
// policy and prevent a deployment path prefix from being discarded after login.
export const normalizeLoginReturnPath = (returnPath: string | null, fallbackPath: string) => {
  if (!returnPath || !returnPath.startsWith('/') || returnPath.startsWith('//')) return fallbackPath;
  if (returnPath.includes('\\') || encodedBackslash.test(returnPath)) return fallbackPath;

  const pathPrefix = fallbackPath === '/' ? '' : fallbackPath.replace(/\/$/, '');
  const pathname = returnPath.split(/[?#]/, 1)[0];
  if (pathPrefix && pathname !== pathPrefix && !pathname.startsWith(`${pathPrefix}/`)) return fallbackPath;

  return returnPath;
};
