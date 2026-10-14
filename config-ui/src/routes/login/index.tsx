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

import { Alert, Divider } from 'antd';
import { useState } from 'react';

import API from '@/api';
import type { Provider } from '@/api/auth';
import { DEVLAKE_ENDPOINT, PATHS } from '@/config';
import { useRefreshData } from '@/hooks';
import { useDocumentTitle } from '@/ui/hooks';
import { toUserMessage } from '@/ui/utils';

import { AuthLayout } from './auth-layout';
import { COPY, LOGIN_ERROR_MAP, LOGIN_PARAMS } from './constants';
import { LocalLoginForm } from './local-login-form';
import { ProviderButtons } from './provider-buttons';
import { Hint, Note, Notices } from './styled';
import type { LocalLoginValues } from './types';
import { normalizeLoginReturnPath } from './utils';

export const Login = () => {
  useDocumentTitle(COPY.title);

  const [localLoginPending, setLocalLoginPending] = useState(false);
  const [localLoginError, setLocalLoginError] = useState<string>();

  const params = new URLSearchParams(window.location.search);
  const returnUrl = normalizeLoginReturnPath(params.get(LOGIN_PARAMS.RETURN_URL), PATHS.ROOT());
  const accessDenied = params.get(LOGIN_PARAMS.ERROR) === LOGIN_PARAMS.ACCESS_DENIED;

  const { data: methods, error: methodsError } = useRefreshData((signal) => API.auth.methods(signal), []);

  const startOIDC = (provider: Provider) => {
    const separator = provider.loginUrl.includes('?') ? '&' : '?';
    window.location.href = `${DEVLAKE_ENDPOINT}${provider.loginUrl}${separator}return_url=${encodeURIComponent(returnUrl)}`;
  };

  const startLocalLogin = async (values: LocalLoginValues) => {
    setLocalLoginPending(true);
    setLocalLoginError(undefined);
    try {
      await API.auth.localLogin({ ...values, returnUrl });
      const user = await API.auth.userinfo().catch(() => null);
      window.location.assign(user?.authenticated && user.mustChangePassword ? PATHS.CHANGE_PASSWORD() : returnUrl);
    } catch (error) {
      setLocalLoginError(toUserMessage(error, LOGIN_ERROR_MAP, COPY.signInFailed));
    } finally {
      setLocalLoginPending(false);
    }
  };

  const providers = methods?.providers ?? [];
  const localEnabled = Boolean(methods?.localPassword?.enabled);
  const apiKeyEnabled = Boolean(methods?.apiKey?.enabled);
  const noProviders = methods !== undefined && providers.length === 0 && !localEnabled && !apiKeyEnabled;

  return (
    <AuthLayout title={COPY.title} subtitle={COPY.subtitle}>
      <Notices>
        {methodsError !== undefined && <Alert type="error" title={COPY.methodsLoadError} />}
        {accessDenied && <Alert type="error" title={COPY.accessDenied} />}
        {localLoginError && <Alert type="error" title={localLoginError} />}
      </Notices>
      {localEnabled && <LocalLoginForm pending={localLoginPending} onSubmit={startLocalLogin} />}
      {localEnabled && providers.length > 0 && <Divider plain>{COPY.divider}</Divider>}
      {providers.length > 0 && <ProviderButtons providers={providers} onSelect={startOIDC} />}
      {providers.length === 0 && apiKeyEnabled && <Hint>{COPY.apiKeyHint}</Hint>}
      {noProviders && <Alert type="warning" title={COPY.noProviders} description={COPY.noProvidersHint} />}
      <Note>{COPY.footerNote}</Note>
    </AuthLayout>
  );
};
