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
import { describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from '../../constants';
import { EditDetailsModal } from '../edit-details-modal';
import { ProjectsModal } from '../projects-modal';
import { SetPasswordModal } from '../set-password-modal';

import { callbacks, expectRejectedAndKept, submit, type, USER_NOT_FOUND_ERROR, user } from './dialog-helpers';
import { waitForPasswordFormReady } from './password-error';

const grafana = vi.mocked(API.grafanaUsers);
const PASSWORD = 'A-long-enough-passw0rd';
const EDITED_NAME = 'Anna';
const SELECTED_ITEM = '.ant-select-selection-item-content';

type Callbacks = ReturnType<typeof callbacks>;

const inputValue = (label: string) => (screen.getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement).value;

const FLOWS = [
  {
    name: 'EditDetailsModal',
    show: (props: Callbacks) => renderWithTheme(<EditDetailsModal open user={user()} {...props} />),
    fill: async () => type(COPY.add.name.label, EDITED_NAME),
    label: COPY.details.submit,
    request: () => grafana.updateUser,
    retained: () => inputValue(COPY.add.name.label) === EDITED_NAME,
  },
  {
    name: 'ProjectsModal',
    show: (props: Callbacks) => renderWithTheme(<ProjectsModal open user={user({ projects: ['alpha'] })} {...props} />),
    fill: async () => {
      fireEvent.mouseDown(screen.getByRole('combobox', { name: COPY.projects.label }));
      fireEvent.click(await screen.findByTitle('beta'));
    },
    label: COPY.projects.submit,
    request: () => grafana.setProjects,
    retained: () =>
      [...document.querySelectorAll(SELECTED_ITEM)].map((item) => item.textContent).join() === 'alpha,beta',
  },
  {
    name: 'SetPasswordModal',
    show: (props: Callbacks) => renderWithTheme(<SetPasswordModal open user={user()} {...props} />),
    fill: async () => type(COPY.password.label, PASSWORD),
    label: COPY.setPassword.submit,
    request: () => grafana.setPassword,
    retained: () => inputValue(COPY.password.label) === PASSWORD,
  },
];

describe.each(FLOWS)('$name after a rejected request', ({ show, fill, label, request, retained }) => {
  it('refreshes the list, keeps the values open, and refreshes and closes only on a successful retry', async () => {
    request().mockRejectedValueOnce(USER_NOT_FOUND_ERROR);
    const props = callbacks();
    show(props);
    await fill();
    fireEvent.click(submit(label));
    await expectRejectedAndKept(props);
    expect(retained()).toBe(true);

    await waitForPasswordFormReady(submit(label));
    fireEvent.click(submit(label));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(props.onChanged).toHaveBeenCalledTimes(2);
    expect(request()).toHaveBeenCalledTimes(2);
  });
});
