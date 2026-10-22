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
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConnectionFieldErrors, ConnectionFieldRenderProps } from '@/types';
import { messageMock } from '@/ui/__tests__/mock-message';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { webhookIngestionFields, type WebhookIngestionValues } from './webhook-ingestion';

vi.mock('antd', async (importOriginal) =>
  (await import('@/ui/__tests__/mock-message')).withMockedMessage(await importOriginal()),
);

type RenderProps = ConnectionFieldRenderProps<WebhookIngestionValues>;

const fields = webhookIngestionFields({
  plugin: 'hubspot',
  sharedKeyDescription: 'Key description',
  sharedKeyPlaceholder: 'Key placeholder',
});

const setup = (values: WebhookIngestionValues, errors: ConnectionFieldErrors = {}) => {
  const setValues = vi.fn();
  const setErrors = vi.fn();
  const props: RenderProps = { type: 'create', initialValues: {}, values, errors, setValues, setErrors };
  renderWithTheme(<>{fields.map((field) => (typeof field === 'function' ? field(props) : null))}</>);
  return { setValues, setErrors };
};

describe('webhookIngestionFields', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets the required error when enabling with an empty key', () => {
    const { setValues, setErrors } = setup({ enableWebhook: false, webhookSharedKey: ' ' });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(setValues).toHaveBeenCalledWith({ enableWebhook: true });
    expect(setErrors).toHaveBeenCalledWith({ webhookSharedKey: 'required' });
  });

  it('disables the URL input until ingestion is enabled', () => {
    setup({ enableWebhook: false });
    expect((screen.getByDisplayValue(/\/webhook$/) as HTMLInputElement).disabled).toBe(true);
  });

  it('enables the URL input and puts the plugin in the URL', () => {
    setup({ enableWebhook: true });
    const input = screen.getByDisplayValue(/\/webhook$/) as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(input.value).toContain('/plugins/hubspot/connections/');
  });

  it('copies the URL and toasts', () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    setup({ enableWebhook: true });
    fireEvent.click(screen.getByRole('button', { name: 'copy' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/plugins/hubspot/connections/'));
    expect(messageMock.success).toHaveBeenCalledWith('Webhook URL copied.');
  });
});
