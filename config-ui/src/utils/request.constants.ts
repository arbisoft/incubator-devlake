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

export const ACCESS_TOKEN_STORAGE_KEY = 'accessToken' as const;
export const AUTHORIZATION_HEADER = 'Authorization' as const;
export const CSRF_COOKIE_NAME = 'devlake_csrf' as const;
export const CSRF_HEADER_NAME = 'X-CSRF-Token' as const;
export const AUTH_USERINFO_PATH = '/auth/userinfo' as const;
export const DEFAULT_REQUEST_METHOD = 'get' as const;
export const GET_METHODS: readonly string[] = ['GET', 'get'] as const;
export const LOGIN_ROUTE_SUFFIX = '/login' as const;
export const PATH_SEPARATOR = '/' as const;
export const HTTP_STATUS = { UNAUTHORIZED: 401, PRECONDITION_REQUIRED: 428 } as const;
export const PLUGIN_CONNECTION_TEST_ROUTE = /\/plugins\/[^/]+(?:\/connections\/[^/]+)?\/test\/?$/;
