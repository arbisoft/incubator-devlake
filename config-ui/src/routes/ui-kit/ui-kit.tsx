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

import { Segmented } from 'antd';

import { selectThemeMode, themeSlice } from '@/features';
import { useAppDispatch, useAppSelector } from '@/hooks';
import type { ThemeMode } from '@/theme/tokens';
import { useDocumentTitle } from '@/ui';

import { COPY, THEME_MODE_LABEL } from './constants';
import { SECTIONS } from './sections';
import { Header, Page, PageTitle } from './styled';

const THEME_OPTIONS = (Object.keys(THEME_MODE_LABEL) as ThemeMode[]).map((mode) => ({
  value: mode,
  label: THEME_MODE_LABEL[mode],
}));

export const UiKit = () => {
  const dispatch = useAppDispatch();
  const mode = useAppSelector(selectThemeMode);
  useDocumentTitle(COPY.title);

  return (
    <Page>
      <Header>
        <PageTitle>{COPY.title}</PageTitle>
        <Segmented
          aria-label={COPY.themeLabel}
          value={mode}
          options={THEME_OPTIONS}
          onChange={(next) => dispatch(themeSlice.actions.setMode(next))}
        />
      </Header>
      {SECTIONS.map(({ id, Demo }) => (
        <Demo key={id} />
      ))}
    </Page>
  );
};
