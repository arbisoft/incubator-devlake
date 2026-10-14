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

import auth0 from '@/images/auth-providers/auth0.svg';
import github from '@/images/auth-providers/github.svg';
import gitlab from '@/images/auth-providers/gitlab.svg';
import google from '@/images/auth-providers/google.svg';
import keycloak from '@/images/auth-providers/keycloak.svg';
import microsoft from '@/images/auth-providers/microsoft.svg';
import okta from '@/images/auth-providers/okta.svg';

import { COPY, PROVIDER_ID } from './constants';
import type { ProviderId, ProviderLogoEntry } from './types';

const entry = (id: ProviderId, src: string, adaptive = false): ProviderLogoEntry => ({
  id,
  src,
  alt: COPY.logoAlt[id],
  adaptive,
});

export const PROVIDER_LOGOS: Record<ProviderId, ProviderLogoEntry> = {
  [PROVIDER_ID.GOOGLE]: entry(PROVIDER_ID.GOOGLE, google),
  [PROVIDER_ID.MICROSOFT]: entry(PROVIDER_ID.MICROSOFT, microsoft),
  [PROVIDER_ID.OKTA]: entry(PROVIDER_ID.OKTA, okta, true),
  [PROVIDER_ID.GITHUB]: entry(PROVIDER_ID.GITHUB, github, true),
  [PROVIDER_ID.GITLAB]: entry(PROVIDER_ID.GITLAB, gitlab),
  [PROVIDER_ID.AUTH0]: entry(PROVIDER_ID.AUTH0, auth0),
  [PROVIDER_ID.KEYCLOAK]: entry(PROVIDER_ID.KEYCLOAK, keycloak),
};
