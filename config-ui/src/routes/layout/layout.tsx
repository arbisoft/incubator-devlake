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

import { useEffect, useMemo } from 'react';
import { Outlet, useLoaderData, useLocation } from 'react-router-dom';

import API from '@/api';
import { PageLoading } from '@/components';
import { COPYRIGHT_HIDE, PATHS } from '@/config';
import { init, selectError, selectStatus, selectThemeMode, setMode } from '@/features';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { OnboardCard } from '@/routes/onboard/components';
import { OtelAttention } from '@/routes/otel/attention';
import { AccountBlock, AppShell, BrandBlock, PoweredByRow, SidebarNav, useSidebarCollapsed } from '@/ui';

import { COPY } from './constants';
import { getNavItems } from './nav';
import { Version } from './styled';
import type { LayoutData } from './types';
import { useAccountMenu, useIdentityLinkNotification } from './use-account-menu';
import { getAccountLabels } from './utils';

export const Layout = () => {
  const { version, plugins, user, access } = useLoaderData() as LayoutData;
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const { pathname } = useLocation();

  const dispatch = useAppDispatch();
  const status = useAppSelector(selectStatus);
  const error = useAppSelector(selectError);
  const themeMode = useAppSelector(selectThemeMode);

  const navItems = useMemo(() => getNavItems({ access, copyrightHide: COPYRIGHT_HIDE }), [access]);
  const { name, secondary } = getAccountLabels(user, access);

  const handleLogout = async () => {
    try {
      const res = await API.auth.logout();
      if (res.logoutUrl) {
        window.location.href = res.logoutUrl;
        return;
      }
    } catch {
      // fall through to /login regardless
    }
    window.location.href = PATHS.LOGIN();
  };

  const { accountMenuItems, loadLinkableProviders } = useAccountMenu({
    version,
    user,
    access,
    themeMode,
    onSelectTheme: (mode) => dispatch(setMode(mode)),
    handleLogout,
  });
  useIdentityLinkNotification();

  useEffect(() => {
    dispatch(init(plugins));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the loader re-runs on search changes, but plugins init once per mount
  }, []);

  if (['idle', 'loading'].includes(status)) {
    return <PageLoading />;
  }

  if (status === 'failed') {
    throw error?.message;
  }

  return (
    <AppShell
      sidebar={
        <SidebarNav
          items={navItems}
          activePath={pathname}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          header={<BrandBlock collapsed={collapsed} />}
          footer={
            <>
              {!collapsed && <PoweredByRow />}
              {!collapsed && version && <Version>{COPY.account.version(version)}</Version>}
              <AccountBlock
                name={name}
                secondary={secondary}
                collapsed={collapsed}
                menu={accountMenuItems}
                onOpenChange={loadLinkableProviders}
              />
            </>
          }
        />
      }
      banner={
        <>
          <OtelAttention />
          <OnboardCard />
        </>
      }
    >
      <Outlet />
    </AppShell>
  );
};
