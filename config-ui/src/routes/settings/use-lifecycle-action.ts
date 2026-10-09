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

import { useCallback } from 'react';

import API from '@/api';
import {
  ACCESS_STATUS,
  type AccessDomain,
  type AccessRole,
  type AccessUser,
  type LocalCredentialResponse,
} from '@/api/access';
import { useConfirmFlow } from '@/ui/hooks';
import { operator } from '@/utils';

import { LIFECYCLE_ACTION, LIFECYCLE_CONFIRM, LIFECYCLE_SUBJECT } from './constants';
import type { LifecycleAction, LifecycleSubject } from './types';
import { getDomainLabel, getLocalCredentialError, getUpdateAccessError, getUserLabel } from './utils';

export type LifecycleTarget =
  | { subject: Extract<LifecycleSubject, 'user'>; item: AccessUser }
  | { subject: Extract<LifecycleSubject, 'domain'>; item: AccessDomain };

type Options = {
  onDone: () => void;
  onCredential?: (credential: LocalCredentialResponse) => void;
};

type Pending = { action: LifecycleAction; target: LifecycleTarget };

const CREDENTIAL_ACTIONS: LifecycleAction[] = [LIFECYCLE_ACTION.RESET_PASSWORD, LIFECYCLE_ACTION.REMOVE_PASSWORD];

const getName = (target: LifecycleTarget) =>
  target.subject === LIFECYCLE_SUBJECT.USER ? getUserLabel(target.item) : getDomainLabel(target.item);

const statusFor = (action: LifecycleAction) =>
  action === LIFECYCLE_ACTION.ENABLE ? ACCESS_STATUS.ACTIVE : ACCESS_STATUS.DISABLED;

const toRequest = ({ action, target }: Pending): (() => Promise<unknown>) | undefined => {
  if (target.subject === LIFECYCLE_SUBJECT.DOMAIN) {
    const { id, defaultRole } = target.item;
    if (action === LIFECYCLE_ACTION.HIDE) return () => API.access.hideDomain(id);
    if (action === LIFECYCLE_ACTION.ENABLE || action === LIFECYCLE_ACTION.DISABLE) {
      return () => API.access.updateDomain(id, { defaultRole, status: statusFor(action) });
    }
    return undefined;
  }
  const { id, role } = target.item;
  switch (action) {
    case LIFECYCLE_ACTION.HIDE:
      return () => API.access.hideUser(id);
    case LIFECYCLE_ACTION.RESET_PASSWORD:
      return () => API.access.resetLocalCredential(id);
    case LIFECYCLE_ACTION.REMOVE_PASSWORD:
      return () => API.access.removeLocalCredential(id);
    case LIFECYCLE_ACTION.ENABLE:
    case LIFECYCLE_ACTION.DISABLE:
      return () => API.access.updateUser(id, { role, status: statusFor(action) });
    default:
      return undefined;
  }
};

const resolve = ({ action, target }: Pending) => ({
  config: LIFECYCLE_CONFIRM[target.subject][action],
  name: getName(target),
});

export const useLifecycleAction = ({ onDone, onCredential }: Options) => {
  const run = useCallback(
    async (next: Pending, setLoading: (loading: boolean) => void) => {
      const request = toRequest(next);
      if (!request) return false;
      const [success, response] = await operator(request, {
        setOperating: setLoading,
        formatReason: CREDENTIAL_ACTIONS.includes(next.action) ? getLocalCredentialError : getUpdateAccessError,
      });
      if (success) {
        if (next.action === LIFECYCLE_ACTION.RESET_PASSWORD && response) onCredential?.(response);
        onDone();
      }
      return success;
    },
    [onCredential, onDone],
  );

  const { request, confirmProps } = useConfirmFlow({ resolve, run });

  const start = useCallback(
    (action: LifecycleAction, target: LifecycleTarget) => request({ action, target }),
    [request],
  );

  const changeRole = useCallback(
    async (target: LifecycleTarget, role: AccessRole) => {
      const [success] = await operator(
        async () => {
          if (target.subject === LIFECYCLE_SUBJECT.USER) {
            await API.access.updateUser(target.item.id, { role, status: target.item.status });
          } else {
            await API.access.updateDomain(target.item.id, { defaultRole: role, status: target.item.status });
          }
        },
        { formatReason: getUpdateAccessError },
      );
      if (success) onDone();
    },
    [onDone],
  );

  return { start, changeRole, confirmProps };
};
