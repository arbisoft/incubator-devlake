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

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import dayjs from 'dayjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { OTEL_STATUS, type OtelConnection, type OtelConnectionResponse } from '@/api/otel';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { REPLAY_COPY } from '../replay-constants';
import { getReplayDateLimits } from '../utils';

import { connection, isDisabled, silenceFeedback } from './__tests__/modal-test-utils';
import { COPY } from './constants';
import { RebindModal } from './rebind-modal';

vi.mock('@/api', () => ({
  default: { otel: { rebind: vi.fn() } },
}));

const otel = vi.mocked(API.otel);

describe('OTel rebind modal', () => {
  beforeEach(silenceFeedback);
  afterEach(() => vi.restoreAllMocks());

  describe('change organization', () => {
    const CURRENT_ORG = '8f14e45f-ceea-4e0a-9f3a-0d2f9a1b2c3d';
    const NEXT_ORG = '1c2d3e4f-0000-4000-8000-000000000001';
    const boundConnection = (overrides: Partial<OtelConnection> = {}) =>
      connection({ organizationId: CURRENT_ORG, createdAt: '2020-01-01T00:00:00Z', ...overrides });

    const renderRebind = (target: OtelConnectionResponse = boundConnection()) => {
      const onRebound = vi.fn();
      renderWithTheme(<RebindModal open connection={target} onClose={vi.fn()} onRebound={onRebound} />);
      return onRebound;
    };
    const typeOrganization = (value: string) =>
      fireEvent.change(screen.getByRole('textbox', { name: COPY.rebind.field.label }), { target: { value } });
    const getContinue = () => screen.getByRole('button', { name: COPY.rebind.submit });
    const isBlocked = () => isDisabled(getContinue());
    const getConfirm = () => screen.findByRole('button', { name: COPY.rebind.confirm.confirm });
    const typeSlug = async (value: string) =>
      fireEvent.change(await screen.findByRole('textbox', { name: COPY.rebind.confirm.slug('platform') }), {
        target: { value },
      });
    const rebindThrough = async () => {
      typeOrganization(NEXT_ORG);
      fireEvent.click(getContinue());
      await typeSlug('platform');
      fireEvent.click(await getConfirm());
    };

    it('blocks continuing for an invalid or unchanged organization ID', () => {
      renderRebind();

      expect(isBlocked()).toBe(true);
      typeOrganization('not-a-uuid');
      expect(isBlocked()).toBe(true);
      typeOrganization(CURRENT_ORG.toUpperCase());
      expect(isBlocked()).toBe(true);
      typeOrganization(NEXT_ORG);
      expect(isBlocked()).toBe(false);
    });

    it('needs the typed team slug before confirming and keeps the values after a failure so it can be retried', async () => {
      const onRebound = renderRebind();
      expect(screen.getByText(COPY.rebind.previousOrg)).toBeTruthy();
      otel.rebind.mockRejectedValueOnce({ response: { status: 400, data: { message: '/private/rebind-internal' } } });
      otel.rebind.mockResolvedValueOnce({ connection: boundConnection() });
      const { min, max } = getReplayDateLimits(new Date());
      typeOrganization(NEXT_ORG);
      fireEvent.click(getContinue());

      const confirm = await getConfirm();
      expect(confirm).toHaveProperty('disabled', true);
      await typeSlug('platform');
      expect(confirm).toHaveProperty('disabled', false);
      fireEvent.click(confirm);
      await waitFor(() => expect(message.error).toHaveBeenCalledWith(REPLAY_COPY.errors.rebind));
      expect(screen.getByRole('textbox', { name: COPY.rebind.field.label })).toHaveProperty('value', NEXT_ORG);
      expect(screen.getByText(COPY.rebind.confirm.title('Platform'))).toBeTruthy();

      await waitFor(() => expect(confirm).toHaveProperty('disabled', false));
      fireEvent.click(confirm);
      await waitFor(() => expect(onRebound).toHaveBeenCalledOnce());
      expect(otel.rebind).toHaveBeenNthCalledWith(1, 7, {
        organizationId: NEXT_ORG,
        replay: { startDate: min, endDate: max },
      });
      expect(otel.rebind).toHaveBeenCalledTimes(2);
      expect(message.success).toHaveBeenCalledWith(COPY.rebind.done('Platform'));
    });

    it('drops the rebuild range and the replay payload when rebuild is unchecked', async () => {
      otel.rebind.mockResolvedValueOnce({ connection: boundConnection() });
      renderRebind();
      expect(screen.getByText(COPY.range.label)).toBeTruthy();

      fireEvent.click(screen.getByRole('checkbox', { name: COPY.rebind.rebuild }));
      expect(screen.queryByText(COPY.range.label)).toBeNull();
      expect(screen.queryByText(COPY.rebind.previousOrg)).toBeNull();
      await rebindThrough();

      await waitFor(() => expect(otel.rebind).toHaveBeenCalledOnce());
      expect(otel.rebind.mock.calls[0][1].replay).toBeUndefined();
    });

    it('shows the revoked notice and ends the default range on the revoke day', async () => {
      const revokedAt = dayjs.utc().subtract(3, 'day');
      otel.rebind.mockResolvedValueOnce({ connection: boundConnection() });
      renderRebind(boundConnection({ status: OTEL_STATUS.REVOKED, revokedAt: revokedAt.toISOString() }));

      expect(screen.getByText(COPY.rebind.revoked)).toBeTruthy();
      expect(screen.queryByText(COPY.rebind.acceptOnly)).toBeNull();
      await rebindThrough();

      await waitFor(() => expect(otel.rebind).toHaveBeenCalledOnce());
      expect(otel.rebind.mock.calls[0][1].replay?.endDate).toBe(revokedAt.format('YYYY-MM-DD'));
    });

    it('follows a refreshed connection without resetting what the user changed', () => {
      const { rerender } = renderWithTheme(
        <RebindModal open connection={boundConnection()} onClose={vi.fn()} onRebound={vi.fn()} />,
      );
      fireEvent.click(screen.getByRole('checkbox', { name: COPY.rebind.rebuild }));

      rerender(
        <RebindModal
          open
          connection={boundConnection({ organizationId: NEXT_ORG })}
          onClose={vi.fn()}
          onRebound={vi.fn()}
        />,
      );

      expect(screen.getByText(NEXT_ORG)).toBeTruthy();
      expect(screen.queryByText(CURRENT_ORG)).toBeNull();
      expect(screen.getByRole('checkbox', { name: COPY.rebind.rebuild })).toHaveProperty('checked', false);
    });

    it('defaults rebuild off for an unbound connection and omits the previous-organization hint', () => {
      renderRebind(boundConnection({ organizationId: null }));

      const rebuild = screen.getByRole('checkbox', { name: COPY.rebind.rebuild });
      expect(rebuild).toHaveProperty('checked', false);
      expect(screen.getByText(COPY.rebind.notBound)).toBeTruthy();
      fireEvent.click(rebuild);
      expect(screen.getByText(COPY.rebind.rebuildHint)).toBeTruthy();
      expect(screen.queryByText(COPY.rebind.previousOrg)).toBeNull();
    });
  });
});
