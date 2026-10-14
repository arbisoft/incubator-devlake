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

import { message } from 'antd';
import { useEffect, useRef, useState } from 'react';

import API from '@/api';
import type { AccessCurrent, LinkableOIDCProvider } from '@/api/access';
import { DEVLAKE_ENDPOINT, PATHS } from '@/config';
import type { ThemeMode } from '@/theme/tokens';

import { getAccountMenuItems } from './account-menu-items';
import { COPY, FAILURE_COOLDOWN_MS, LINK_IDENTITY } from './constants';
import type { LayoutUser } from './types';

type UseAccountMenuOptions = {
  version: string;
  user: LayoutUser | null;
  access: AccessCurrent | null;
  themeMode: ThemeMode;
  onSelectTheme: (mode: ThemeMode) => void;
  handleLogout: () => void;
};

export const useAccountMenu = ({
  version,
  user,
  access,
  themeMode,
  onSelectTheme,
  handleLogout,
}: UseAccountMenuOptions) => {
  const [linkableProviders, setLinkableProviders] = useState<LinkableOIDCProvider[]>();
  const [linkProvidersFailed, setLinkProvidersFailed] = useState(false);
  const lastFailedAtRef = useRef<number>(0);

  const loadLinkableProviders = (open: boolean) => {
    if (!open || !user?.authenticated || !access?.enabled || linkableProviders) return;
    const now = Date.now();
    if (linkProvidersFailed && now - lastFailedAtRef.current < FAILURE_COOLDOWN_MS) {
      return;
    }
    API.access
      .listLinkableOIDCProviders()
      .then((providers) => {
        setLinkableProviders(providers);
        setLinkProvidersFailed(false);
      })
      .catch(() => {
        lastFailedAtRef.current = Date.now();
        setLinkProvidersFailed(true);
      });
  };

  const startIdentityLink = (providerKey: string) => {
    const returnURL = `${window.location.pathname}${window.location.search}`;
    const provider = `${LINK_IDENTITY.PROVIDER_PARAM}=${encodeURIComponent(providerKey)}`;
    const returnTo = `${LINK_IDENTITY.RETURN_URL_PARAM}=${encodeURIComponent(returnURL)}`;
    window.location.assign(`${DEVLAKE_ENDPOINT}${LINK_IDENTITY.PATH}?${provider}&${returnTo}`);
  };

  const accountMenuItems = getAccountMenuItems(
    { version, user, linkableProviders, linkProvidersFailed, themeMode },
    {
      onSelectTheme,
      onChangePassword: () => window.location.assign(PATHS.CHANGE_PASSWORD()),
      onLinkIdentity: startIdentityLink,
      onSignOut: handleLogout,
    },
  );

  return {
    accountMenuItems,
    loadLinkableProviders,
  };
};

export const useIdentityLinkNotification = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const identityLinkResult = params.get(LINK_IDENTITY.RESULT_PARAM);
    if (!identityLinkResult) return;
    if (identityLinkResult === LINK_IDENTITY.RESULT_LINKED) {
      message.success(COPY.identityLink.linked);
    } else {
      message.error(COPY.identityLink.failed);
    }
    params.delete(LINK_IDENTITY.RESULT_PARAM);
    const query = params.toString();
    const search = query ? `?${query}` : '';
    window.history.replaceState(null, '', `${window.location.pathname}${search}`);
  }, []);
};
