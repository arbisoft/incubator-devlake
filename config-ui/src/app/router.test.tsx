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

import { isValidElement } from 'react';
import { matchRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PATHS, PROJECT_TAB } from '@/config';
import { accessLoader, ParamRedirect, SettingsActivity, SettingsAuthentication, SettingsUsers } from '@/routes';

import { routes } from './router';

const redirectTarget = (url: string): string | undefined => {
  const matches = matchRoutes(routes, url);
  const leaf = matches?.[matches.length - 1];
  const element = leaf?.route.element;
  if (!leaf || !isValidElement<{ to: (params: Record<string, string | undefined>) => string }>(element)) {
    return undefined;
  }
  return element.type === ParamRedirect ? element.props.to(leaf.params) : undefined;
};

const renderedBy = (url: string) => {
  const matches = matchRoutes(routes, url);
  const element = matches?.[matches.length - 1]?.route.element;
  return isValidElement(element) ? element.type : undefined;
};

describe('legacy redirects', () => {
  it.each([
    ['/access', PATHS.SETTINGS_USERS()],
    ['/settings', PATHS.SETTINGS_USERS()],
    ['/projects/demo', PATHS.PROJECT_TAB('demo', PROJECT_TAB.BLUEPRINT)],
    ['/projects/my%20project', PATHS.PROJECT_TAB('my project', PROJECT_TAB.BLUEPRINT)],
    ['/projects/demo/github-1', PATHS.PROJECT_BLUEPRINT_CONNECTION('demo', 'github-1')],
    ['/advanced/blueprints/7/github-1', PATHS.BLUEPRINT_CONNECTION(7, 'github', 1)],
  ])('%s resolves to a redirect to %s', (from, to) => {
    expect(redirectTarget(from)).toBe(to);
  });

  it.each(Object.values(PROJECT_TAB))('keeps the static %s tab out of the :unique redirect', (tab) => {
    expect(redirectTarget(PATHS.PROJECT_TAB('demo', tab))).toBeUndefined();
  });

  it('keeps the connection detail routes out of the :unique redirects', () => {
    expect(redirectTarget(PATHS.PROJECT_CONNECTION('demo', 'github', 1))).toBeUndefined();
    expect(redirectTarget(PATHS.BLUEPRINT_CONNECTION(7, 'github', 1))).toBeUndefined();
  });

  it('serves every project tab from the same page', () => {
    const pages = new Set(Object.values(PROJECT_TAB).map((tab) => renderedBy(PATHS.PROJECT_TAB('demo', tab))));
    expect(pages.size).toBe(1);
    expect(pages.has(undefined)).toBe(false);
  });

  it.each([
    [PATHS.SETTINGS_USERS(), SettingsUsers],
    [PATHS.SETTINGS_AUTHENTICATION(), SettingsAuthentication],
    [PATHS.SETTINGS_ACTIVITY(), SettingsActivity],
  ])('guards %s with the access loader and renders its page', (path, page) => {
    const matches = matchRoutes(routes, path) ?? [];
    expect(matches.some((match) => match.route.loader === accessLoader)).toBe(true);
    expect(renderedBy(path)).toBe(page);
  });
});
