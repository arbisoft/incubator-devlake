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

import MillerColumnsSelect, { type McsColumn } from 'miller-columns-select';
import { useRef } from 'react';
import { useTheme } from 'styled-components';

import { Loading } from '@/components';

import { COPY, LOADING_ICON_SIZE, SCOPE_MODE } from './constants';
import { ColumnTitle, ErrorRow, Frame, LoadingRow } from './styled';
import type { ScopePanesProps } from './types';
import { usePaneKeyboard } from './use-pane-keyboard';

export const ScopePanes = <T,>({ firstColumnTitle, compact, ...millerProps }: ScopePanesProps<T>) => {
  const { layout } = useTheme();
  const frameRef = useRef<HTMLDivElement>(null);
  const handleKeyDown = usePaneKeyboard(frameRef, millerProps.mode === SCOPE_MODE.SINGLE);

  const renderTitle = (column: McsColumn) => {
    const title = column.parentId ? column.parentTitle : firstColumnTitle;
    return title ? <ColumnTitle>{title}</ColumnTitle> : null;
  };

  return (
    <Frame ref={frameRef} onKeyDown={handleKeyDown}>
      <MillerColumnsSelect<T>
        {...millerProps}
        columnHeight={compact ? layout.scopePaneHeightCompact : layout.scopePaneHeight}
        renderTitle={renderTitle}
        renderLoading={() => (
          <LoadingRow>
            <Loading size={LOADING_ICON_SIZE} />
          </LoadingRow>
        )}
        renderError={() => <ErrorRow>{COPY.loadFailed}</ErrorRow>}
      />
    </Frame>
  );
};
