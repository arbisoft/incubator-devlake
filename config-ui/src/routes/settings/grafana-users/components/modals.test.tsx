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

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { message } from 'antd';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { GRAFANA_ERROR_CODE, GRAFANA_ROLE } from '@/api/grafana-users/constants';
import type { GrafanaUser } from '@/api/grafana-users/types';
import type { IProject } from '@/types';
import { COMMON_COPY } from '@/ui';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { TemporaryPasswordModal } from '../../components';
import type { TemporaryCredential } from '../../components/types';
import { COPY as SETTINGS_COPY } from '../../constants';
import { COPY } from '../constants';

import { EditDetailsModal } from './edit-details-modal';
import { OrphansModal } from './orphans-modal';
import { ProjectsModal } from './projects-modal';
import { SetPasswordModal } from './set-password-modal';

vi.mock('antd', async (importOriginal) => {
  const { withMockedAntdMessage } = await import('../../__tests__/test-utils');
  return withMockedAntdMessage(importOriginal);
});

vi.mock('@/api', async () => {
  const testUtils = await import('../../__tests__/test-utils');
  return testUtils.mockGrafanaUsersApi();
});

const grafana = vi.mocked(API.grafanaUsers);
const projectList = vi.mocked(API.project.list);
const EMAIL = 'ann@example.com';
const ORPHAN_EMAIL = 'gone@example.com';
const MODAL_SELECTOR = '.ant-modal';
const ARIA_TRUE = 'true';
const project = (name: string): IProject => ({ name, description: '', blueprint: null, metrics: [] });
const PASSWORD = 'a-long-enough-password';

const user = (patch: Partial<GrafanaUser> = {}): GrafanaUser => ({
  id: 5,
  email: EMAIL,
  name: 'Ann Lee',
  role: GRAFANA_ROLE.VIEWER,
  disabled: false,
  sso: false,
  protected: false,
  projects: [],
  ...patch,
});

const callbacks = () => ({ onClose: vi.fn(), onChanged: vi.fn(), onPassword: vi.fn() });

const submit = (name: string) => screen.getByRole('button', { name: new RegExp(`${name}$`) });
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });

const TemporaryPasswordHarness = () => {
  const [open, setOpen] = useState(true);
  const [credential, setCredential] = useState<TemporaryCredential | undefined>({
    loginName: EMAIL,
    temporaryPassword: PASSWORD,
  });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen temporary password
      </button>
      <TemporaryPasswordModal
        open={open}
        credential={credential}
        onClose={() => setOpen(false)}
        onClosed={() => setCredential(undefined)}
      />
    </>
  );
};

beforeEach(() => {
  vi.resetAllMocks();
  projectList.mockResolvedValue({ projects: [project('alpha'), project('beta')], count: 2 });
});

afterEach(() => {
  vi.mocked(message.success).mockClear();
  vi.mocked(message.error).mockClear();
  vi.restoreAllMocks();
});

describe('EditDetailsModal', () => {
  it('sends only the changed field and asks nothing when the email is unchanged', async () => {
    const props = callbacks();
    renderWithTheme(<EditDetailsModal open user={user()} {...props} />);
    type(COPY.add.name.label, 'Anna Lee');
    fireEvent.click(submit(COPY.details.submit));
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    expect(grafana.updateUser).toHaveBeenCalledWith(5, { name: 'Anna Lee', email: undefined });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('closes without a request when nothing changed', () => {
    const props = callbacks();
    renderWithTheme(<EditDetailsModal open user={user()} {...props} />);
    fireEvent.click(submit(COPY.details.submit));
    expect(grafana.updateUser).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('confirms an email change first and keeps it when the user backs out', async () => {
    const props = callbacks();
    renderWithTheme(<EditDetailsModal open user={user()} {...props} />);
    type(COPY.add.email.label, 'New@Example.com');
    fireEvent.click(submit(COPY.details.submit));
    expect(await screen.findByText(COPY.details.confirm.description('Ann Lee', 'new@example.com'))).toBeTruthy();
    expect(grafana.updateUser).not.toHaveBeenCalled();

    const dialog = screen.getByText(COPY.details.confirm.title()).closest(MODAL_SELECTOR) as HTMLElement;
    fireEvent.click(within(dialog).getByRole('button', { name: COMMON_COPY.cancel }));
    expect(grafana.updateUser).not.toHaveBeenCalled();

    fireEvent.click(submit(COPY.details.submit));
    const again = (await screen.findByText(COPY.details.confirm.title())).closest(MODAL_SELECTOR) as HTMLElement;
    fireEvent.click(within(again).getByRole('button', { name: COPY.details.confirm.confirm }));
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    expect(grafana.updateUser).toHaveBeenCalledWith(5, { name: undefined, email: 'new@example.com' });
  });

  it('shows an SSO account read-only with a note and no save', () => {
    const props = callbacks();
    renderWithTheme(<EditDetailsModal open user={user({ sso: true })} {...props} />);
    expect(screen.getByText(COPY.details.ssoNote)).toBeTruthy();
    expect((screen.getByLabelText(new RegExp(`^${COPY.add.email.label}`)) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(new RegExp(`^${COPY.add.name.label}`)) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: COPY.details.submit })).toBeNull();
    expect(screen.queryByRole('button', { name: COMMON_COPY.cancel })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: COPY.actions.close }).at(-1) as HTMLElement);
    expect(props.onClose).toHaveBeenCalled();
    expect(grafana.updateUser).not.toHaveBeenCalled();
  });

  it('keeps the dialog and values when the save fails', async () => {
    grafana.updateUser.mockRejectedValueOnce({
      response: { status: 403, data: { code: GRAFANA_ERROR_CODE.USER_SSO_MANAGED } },
    });
    const props = callbacks();
    renderWithTheme(<EditDetailsModal open user={user()} {...props} />);
    type(COPY.add.name.label, 'Anna');
    fireEvent.click(submit(COPY.details.submit));
    await waitFor(() => expect(message.error).toHaveBeenCalled());
    expect(props.onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText(new RegExp(`^${COPY.add.name.label}`)) as HTMLInputElement).value).toBe('Anna');
  });
});

describe('ProjectsModal', () => {
  it('saves the full set of projects, adding to the ones the user already has', async () => {
    const props = callbacks();
    renderWithTheme(<ProjectsModal open user={user({ projects: ['alpha'] })} {...props} />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: COPY.projects.label }));
    fireEvent.click(await screen.findByTitle('beta'));
    fireEvent.click(submit(COPY.projects.submit));
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    expect(grafana.setProjects).toHaveBeenCalledWith(5, ['alpha', 'beta']);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('keeps names the search page does not list and allows an empty set with a hint', async () => {
    projectList.mockResolvedValue({ projects: [], count: 0 });
    const props = callbacks();
    renderWithTheme(<ProjectsModal open user={user({ projects: ['gone-from-page'] })} {...props} />);
    expect(await screen.findByText('gone-from-page')).toBeTruthy();
    expect(screen.queryByText(COPY.projects.emptyHint)).toBeNull();

    fireEvent.click(document.querySelector('.ant-select-selection-item-remove') as HTMLElement);
    expect(await screen.findByText(COPY.projects.emptyHint)).toBeTruthy();
    fireEvent.click(submit(COPY.projects.submit));
    await waitFor(() => expect(grafana.setProjects).toHaveBeenCalledWith(5, []));
  });

  it('keeps the dialog open when the save fails', async () => {
    grafana.setProjects.mockRejectedValueOnce(new Error('boom'));
    const props = callbacks();
    renderWithTheme(<ProjectsModal open user={user()} {...props} />);
    fireEvent.click(submit(COPY.projects.submit));
    await waitFor(() => expect(message.error).toHaveBeenCalled());
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onChanged).not.toHaveBeenCalled();
  });
});

describe('SetPasswordModal', () => {
  it('needs a long enough password, then sets it and hands it to the one-time dialog', async () => {
    const props = callbacks();
    renderWithTheme(<SetPasswordModal open user={user()} {...props} />);
    type(COPY.password.label, 'short');
    expect(submit(COPY.setPassword.submit).getAttribute('aria-disabled')).toBe(ARIA_TRUE);
    fireEvent.click(submit(COPY.setPassword.submit));
    expect(grafana.setPassword).not.toHaveBeenCalled();

    type(COPY.password.label, PASSWORD);
    fireEvent.click(submit(COPY.setPassword.submit));
    await waitFor(() => expect(props.onPassword).toHaveBeenCalled());
    expect(grafana.setPassword).toHaveBeenCalledWith(5, PASSWORD);
    expect(props.onPassword).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD });
    expect(props.onClose).toHaveBeenCalled();
    expect((screen.getByLabelText(new RegExp(`^${COPY.password.label}`)) as HTMLInputElement).value).toBe('');
  });

  it('generates a password of 24 characters', () => {
    renderWithTheme(<SetPasswordModal open user={user()} {...callbacks()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(COPY.password.generate) }));
    expect((screen.getByLabelText(new RegExp(`^${COPY.password.label}`)) as HTMLInputElement).value).toHaveLength(24);
  });

  it('keeps the password and shows no one-time dialog when the request fails', async () => {
    grafana.setPassword.mockRejectedValueOnce(new Error('boom'));
    const props = callbacks();
    renderWithTheme(<SetPasswordModal open user={user()} {...props} />);
    type(COPY.password.label, PASSWORD);
    fireEvent.click(submit(COPY.setPassword.submit));
    await waitFor(() => expect(message.error).toHaveBeenCalled());
    expect(props.onPassword).not.toHaveBeenCalled();
    expect((screen.getByLabelText(new RegExp(`^${COPY.password.label}`)) as HTMLInputElement).value).toBe(PASSWORD);
  });
});

describe('TemporaryPasswordModal', () => {
  it('clears its credential after closing and does not restore it when reopened', async () => {
    const copy = SETTINGS_COPY.modals.temporaryPassword;
    const passwordLabel = copy.passwordFor(EMAIL);
    renderWithTheme(<TemporaryPasswordHarness />);
    expect(((await screen.findByLabelText(passwordLabel)) as HTMLInputElement).value).toBe(PASSWORD);

    const modal = screen.getByText(copy.title).closest(MODAL_SELECTOR) as HTMLElement;
    fireEvent.click(within(modal).getByRole('button', { name: copy.done }));
    await waitFor(() => expect(modal.classList.contains('ant-zoom-leave-active')).toBe(true));
    fireEvent.transitionEnd(modal);
    await waitFor(() => expect(screen.queryAllByLabelText(passwordLabel)).toHaveLength(0));

    fireEvent.click(screen.getByRole('button', { name: 'Reopen temporary password' }));
    const reopened = screen.getByRole('dialog', { name: copy.title });
    expect((within(reopened).getByRole('textbox') as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText(COPY.password.oneTime.passwordFor(EMAIL))).toBeNull();
  });
});

describe('OrphansModal', () => {
  const orphans = [{ account: ORPHAN_EMAIL, projects: ['alpha'] }];

  it('lists each account with its projects and asks before clearing', async () => {
    const props = callbacks();
    renderWithTheme(<OrphansModal open orphans={orphans} onClose={props.onClose} onChanged={props.onChanged} />);
    expect(screen.getByText(ORPHAN_EMAIL)).toBeTruthy();
    expect(screen.getByText('alpha')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: COPY.orphansDialog.clearFor(ORPHAN_EMAIL) }));
    expect(await screen.findByText(COPY.orphansDialog.confirm.title(ORPHAN_EMAIL))).toBeTruthy();
    expect(grafana.clearOrphan).not.toHaveBeenCalled();

    const dialog = screen
      .getByText(COPY.orphansDialog.confirm.title(ORPHAN_EMAIL))
      .closest(MODAL_SELECTOR) as HTMLElement;
    fireEvent.click(within(dialog).getByRole('button', { name: COPY.orphansDialog.confirm.confirm }));
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    expect(grafana.clearOrphan).toHaveBeenCalledWith(ORPHAN_EMAIL);
  });

  it('stays closed when no orphan is left', () => {
    renderWithTheme(<OrphansModal open orphans={[]} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.queryByText(COPY.orphansDialog.title)).toBeNull();
  });
});
