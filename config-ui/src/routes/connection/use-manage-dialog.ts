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
import { useCallback, useRef, useState, type FocusEvent } from 'react';

import { MANAGE_DIALOG_MODE } from './constants';
import type { ManageDialogMode } from './types';

type ManageDialogState = { open: boolean; mode: ManageDialogMode; plugin: string };

const CLOSED: ManageDialogState = { open: false, mode: MANAGE_DIALOG_MODE.LIST, plugin: '' };

// The dialog stays mounted and keeps its content until its close animation ends, so focus returns to the opener.
export const useManageDialog = () => {
  const [state, setState] = useState<ManageDialogState>(CLOSED);
  const opener = useRef<HTMLButtonElement | null>(null);

  // A menu item is gone by the time the dialog closes, so the card button that was last focused takes focus back.
  const rememberOpener = useCallback((event: FocusEvent<HTMLElement>) => {
    const { target, currentTarget } = event;
    if (target instanceof HTMLButtonElement && currentTarget.contains(target)) opener.current = target;
  }, []);

  const showList = useCallback((plugin: string) => setState({ open: true, mode: MANAGE_DIALOG_MODE.LIST, plugin }), []);
  const showForm = useCallback((plugin: string) => setState({ open: true, mode: MANAGE_DIALOG_MODE.FORM, plugin }), []);
  const hide = useCallback(() => setState((current) => ({ ...current, open: false })), []);
  const reset = useCallback(() => {
    setState(CLOSED);
    if (opener.current?.isConnected) opener.current.focus();
  }, []);

  return { ...state, isForm: state.mode === MANAGE_DIALOG_MODE.FORM, showList, showForm, hide, reset, rememberOpener };
};
