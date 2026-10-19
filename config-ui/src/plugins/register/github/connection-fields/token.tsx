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

import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { Input, Button } from 'antd';
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';

import API from '@/api';
import { Block, ExternalLink, Loading } from '@/components';
import { cleanTestMessage } from '@/features/connections';
import { DOC_URL } from '@/release';

import { COPY } from './constants';
import * as S from './styled';
import { getGithubTokenType, isMaskedGithubToken } from './token-utils';

type TokenItem = {
  id: string;
  value: string;
  isValid?: boolean;
  from?: string;
  status?: 'success' | 'warning' | 'error';
  message?: string;
};

interface Props {
  type: 'create' | 'update';
  connectionId?: ID;
  endpoint?: string;
  proxy: string;
  initialValue: string;
  value: string;
  error: string;
  setValue: (value: string) => void;
  setError: (error?: string) => void;
}

export const Token = ({ type, connectionId, endpoint, proxy, initialValue, value, setValue, setError }: Props) => {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const tokenIdPrefix = useId();
  const initialTokenValues = initialValue.split(',').filter(Boolean);
  const nextTokenId = useRef(initialTokenValues.length || 1);
  const createTokenItem = (value: string): TokenItem => ({ id: `${tokenIdPrefix}-${nextTokenId.current++}`, value });
  const [tokens, setTokens] = useState<TokenItem[]>(() => {
    const values = initialTokenValues.length ? initialTokenValues : [''];
    return values.map((value, index) => ({ id: `${tokenIdPrefix}-${index}`, value }));
  });

  const buildTokenItem = (
    token: TokenItem,
    res: { success: boolean; login?: string; warning?: boolean; message?: string },
  ): TokenItem => {
    let status: TokenItem['status'] = 'success';
    if (!res.success) status = 'error';
    else if (res.warning) status = 'warning';

    return { ...token, isValid: !!res.login, from: res.login, status, message: cleanTestMessage(res.message) };
  };

  const testSavedToken = async (token: TokenItem): Promise<TokenItem> => {
    if (!connectionId) {
      return {
        ...token,
        isValid: false,
        status: 'error',
        message: COPY.tokenTestFailed,
      };
    }

    const res = await API.connection.test('github', connectionId);
    const matchedToken = (res.tokens ?? []).find((it) => it.token === token.value);

    if (!matchedToken) {
      return {
        ...token,
        isValid: false,
        status: 'error',
      };
    }

    return buildTokenItem({ ...token, value: matchedToken.token }, matchedToken);
  };

  const testToken = async (token: TokenItem): Promise<TokenItem> => {
    if (!endpoint || !token.value) return token;

    try {
      if (type === 'update' && isMaskedGithubToken(token.value)) {
        return await testSavedToken(token);
      }

      const res = await API.connection.testOld('github', {
        authMethod: 'AccessToken',
        endpoint,
        proxy,
        token: token.value,
      });
      return buildTokenItem(token, {
        success: res.success,
        login: res.login,
        warning: res.warning,
        message: res.message,
      });
    } catch {
      return {
        ...token,
        isValid: false,
        status: 'error',
        message: COPY.tokenTestFailed,
      };
    }
  };

  const checkTokens = useEffectEvent(async (connectionId: ID) => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await API.connection.test('github', connectionId);
      setTokens((res.tokens ?? []).map((it) => buildTokenItem(createTokenItem(it.token), it)));
    } catch {
      setLoadError(true);
      setTokens(() => {
        const values = initialTokenValues.length ? initialTokenValues : [''];
        return values.map((value, index) => ({ id: `${tokenIdPrefix}-${index}`, value }));
      });
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (connectionId) {
      void checkTokens(connectionId);
    }
  }, [connectionId]);

  const setTokenError = useEffectEvent((value?: string) => setError(value));
  useEffect(() => {
    setTokenError(type === 'create' && !value ? COPY.tokenRequired : undefined);

    return () => {
      setTokenError('');
    };
  }, [type, value]);

  const syncTokenValue = useEffectEvent(() => setValue(tokens.map((it) => it.value).join(',')));
  useEffect(() => syncTokenValue(), [tokens]);

  const handleCreateToken = () => setTokens((current) => [...current, createTokenItem('')]);

  const handleRemoveToken = (id: string) => setTokens((current) => current.filter((it) => it.id !== id));

  const handleChangeToken = (id: string, value: string) =>
    setTokens((current) => current.map((it) => (it.id === id ? { id, value } : it)));

  const handleTestToken = async (id: string, value: string) => {
    const token = tokens.find((it) => it.id === id);
    if (!token || token.isValid !== undefined || !value || token.value !== value) return;

    const result = await testToken(token);
    setTokens((current) => current.map((it) => (it.id === id && it.value === value ? result : it)));
  };

  return (
    <Block
      title={COPY.title}
      description={
        <>
          {COPY.description} <ExternalLink link={DOC_URL.PLUGIN.GITHUB.AUTH_TOKEN}>{COPY.createTokenLink}</ExternalLink>
        </>
      }
      required
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {loadError && <S.Alert role="alert">{COPY.savedTokensLoadFailed}</S.Alert>}
          {tokens.map(({ id, value, isValid, status, from, message }) => {
            const tokenType = getGithubTokenType(value);
            const isFineGrained = tokenType === 'fine-grained';

            return (
              <S.Input key={id}>
                <div className="input">
                  <Input.Password
                    placeholder={COPY.tokenPlaceholder}
                    value={value}
                    onChange={(e) => handleChangeToken(id, e.target.value)}
                    onBlur={() => void handleTestToken(id, value)}
                  />
                  <Button
                    type="text"
                    icon={<CloseOutlined />}
                    aria-label={COPY.removeToken}
                    onClick={() => handleRemoveToken(id)}
                  />
                  <div className="info">
                    {isValid === false && <span className="error">{COPY.invalidToken}</span>}
                    {isValid === true && <span className="success">{COPY.validFrom(from)}</span>}
                  </div>
                </div>
                {isFineGrained && !status && <S.Alert>{COPY.fineGrainedGuidance}</S.Alert>}
                {status && (
                  <S.Alert>
                    <h4>
                      {status === 'success' && <S.SuccessPermissionIcon />}
                      {status === 'warning' && <S.WarningPermissionIcon />}
                      {status === 'error' && <S.ErrorPermissionIcon />}
                      <S.PermissionTitle>{COPY.permissionsHeading}</S.PermissionTitle>
                    </h4>
                    {isFineGrained && isValid && status !== 'error' && (
                      <>
                        {message && message !== COPY.fineGrainedSuccess && <p>{message}</p>}
                        <p>{COPY.fineGrainedSuccess}</p>
                      </>
                    )}
                    {status === 'success' && tokenType === 'classic' && <p>{message || COPY.classicSuccess}</p>}
                    {status === 'warning' && tokenType === 'classic' && <p>{message || COPY.classicWarning}</p>}
                    {status === 'error' && isFineGrained && <p>{message || COPY.fineGrainedAuthError}</p>}
                    {status === 'error' &&
                      tokenType === 'classic' &&
                      (message ? (
                        <p>{message}</p>
                      ) : (
                        <>
                          <p>{COPY.classicInvalidScopes}</p>
                          <p>{COPY.classicPrivateRepositories}</p>
                        </>
                      ))}
                  </S.Alert>
                )}
              </S.Input>
            );
          })}
        </>
      )}
      <div className="action">
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreateToken}>
          {COPY.anotherToken}
        </Button>
      </div>
    </Block>
  );
};
