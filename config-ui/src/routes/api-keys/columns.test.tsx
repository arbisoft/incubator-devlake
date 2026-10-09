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

import { fireEvent, screen } from '@testing-library/react';
import type { TableColumnsType } from 'antd';
import { describe, expect, it, vi } from 'vitest';

import type { IApiKey } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { getColumns } from './columns';
import { COPY, KEY_COLUMN } from './constants';

const PREFIX = 'https://devlake.example.com/api/rest/';
const KEY: IApiKey = { id: '7', name: 'Arbisoft Website', allowedPath: '.*', creator: 'admin' };

const column = (columns: TableColumnsType<IApiKey>, key: string) => columns.find((item) => item.key === key);

const renderCell = (key: string, record: IApiKey, onRevoke = vi.fn()) => {
  const col = column(getColumns({ pathPrefix: PREFIX, onRevoke }), key);
  const value = key === KEY_COLUMN.EXPIRATION ? record.expiredAt : record.allowedPath;
  return renderWithTheme(<>{col && 'render' in col && col.render?.(value, record, 0)}</>);
};

describe('API key columns', () => {
  it('sorts only on the expiration column', () => {
    const columns = getColumns({ pathPrefix: PREFIX, onRevoke: vi.fn() });
    expect(columns.filter((item) => 'sorter' in item && item.sorter).map((item) => item.key)).toEqual([
      KEY_COLUMN.EXPIRATION,
    ]);
  });

  it('shows no expiration for a key that never expires', () => {
    renderCell(KEY_COLUMN.EXPIRATION, KEY);
    expect(screen.getByText(COPY.noExpiration)).toBeTruthy();
    expect(screen.queryByText(COPY.expired)).toBeNull();
  });

  it('flags a key whose expiry has passed', () => {
    renderCell(KEY_COLUMN.EXPIRATION, { ...KEY, expiredAt: '2020-01-01T00:00:00.000Z' });
    expect(screen.getByText('2020-01-01')).toBeTruthy();
    expect(screen.getByText(COPY.expired)).toBeTruthy();
  });

  it('shows the allowed path under the REST prefix', () => {
    renderCell(KEY_COLUMN.ALLOWED_PATH, { ...KEY, allowedPath: '^/projects$' });
    expect(screen.getByText(`${PREFIX}^/projects$`)).toBeTruthy();
  });

  it('names each revoke button after its key and reports the key', () => {
    const onRevoke = vi.fn();
    const col = column(getColumns({ pathPrefix: PREFIX, onRevoke }), KEY_COLUMN.ACTIONS);
    renderWithTheme(<>{col && 'render' in col && col.render?.(undefined, KEY, 0)}</>);
    fireEvent.click(screen.getByRole('button', { name: COPY.revokeKey(KEY.name) }));
    expect(onRevoke).toHaveBeenCalledWith(KEY);
  });
});
