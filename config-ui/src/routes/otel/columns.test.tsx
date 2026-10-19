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
import { describe, expect, it, vi } from 'vitest';

import { OTEL_STATUS, type OtelConnectionResponse } from '@/api/otel';
import { DataTable, EMPTY_STATE_SIZE } from '@/ui';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { getConnectionColumns } from './columns';
import { COPY } from './constants';
import { REPLAY_COPY } from './replay-constants';

const revoked: OtelConnectionResponse = {
  connection: {
    id: 7,
    name: 'claude-platform',
    teamName: 'Platform',
    teamSlug: 'platform',
    collectorEndpoint: 'https://collector.example.com',
    protocol: 'http',
    status: OTEL_STATUS.REVOKED,
    organizationId: null,
    revokedAt: '2026-10-10T08:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-10-10T08:00:00Z',
  },
  credentials: [],
  restartRequired: false,
  recoveryRequired: false,
  storageNeedsApplying: false,
  projects: [],
};

describe('getConnectionColumns', () => {
  it('keeps Change organization enabled for a revoked connection', () => {
    const onRebind = vi.fn();
    const columns = getConnectionColumns({
      onManageProjects: vi.fn(),
      onRebind,
      onAction: vi.fn(),
      onActionButtonRef: vi.fn(),
    });
    renderWithTheme(
      <DataTable
        rowKey={({ connection }) => connection.id}
        ariaLabel={COPY.connections.tableLabel}
        loading={false}
        columns={columns}
        dataSource={[revoked]}
        empty={{ ...COPY.connections.empty, size: EMPTY_STATE_SIZE.SECTION }}
      />,
    );

    const rebind = screen.getByRole('button', { name: REPLAY_COPY.rebindAction('Platform') });
    expect(rebind).toHaveProperty('disabled', false);
    fireEvent.click(rebind);
    expect(onRebind).toHaveBeenCalledWith(revoked);
  });
});
