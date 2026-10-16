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

import { Button } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'styled-components';

import API from '@/api';
import { ConfirmModal, MODAL_WIDTH, STATUS_BADGE_VARIANT, STATUS_TONE, StatusBadge } from '@/ui';
import { useConfirmFlow } from '@/ui/hooks';
import { operator } from '@/utils';

import { Dialog, Hint, TitleRow } from '../../components';
import { COPY, GRAFANA_FLOW_ERRORS } from '../constants';
import { getFlowError } from '../utils';

import { OrphanAccount, OrphanList, OrphanProjects, OrphanRow } from './styled';
import type { OrphansModalProps } from './types';

const copy = COPY.orphansDialog;

export const OrphansModal = ({ open, orphans, onClose, onChanged }: OrphansModalProps) => {
  const { layout } = useTheme();
  const clearing = useRef<string | undefined>(undefined);
  const [clearingAccount, setClearingAccount] = useState<string>();
  const [cleared, setCleared] = useState<ReadonlySet<string>>(new Set());

  const listed = new Set(orphans.map(({ account }) => account));
  if ([...cleared].some((account) => !listed.has(account))) {
    setCleared(new Set([...cleared].filter((account) => listed.has(account))));
  }
  const visibleOrphans = orphans.filter(({ account }) => !cleared.has(account));

  const { request, confirmProps } = useConfirmFlow<string>({
    resolve: (account) => ({ config: copy.confirm, name: account }),
    run: async (account, setLoading) => {
      if (clearing.current !== undefined) return false;
      clearing.current = account;
      setClearingAccount(account);
      try {
        const [success] = await operator(() => API.grafanaUsers.clearOrphan(account), {
          setOperating: setLoading,
          formatReason: getFlowError(GRAFANA_FLOW_ERRORS.ORPHAN),
        });
        onChanged();
        if (success) setCleared((current) => new Set(current).add(account));
        return success;
      } finally {
        clearing.current = undefined;
        setClearingAccount(undefined);
      }
    },
  });

  const requestClear = (account: string) => {
    if (clearing.current === undefined) request(account);
  };

  useEffect(() => {
    if (open && visibleOrphans.length === 0) onClose();
  }, [open, visibleOrphans.length, onClose]);

  return (
    <>
      <Dialog
        open={open && visibleOrphans.length > 0}
        centered
        destroyOnHidden
        width={layout.modalWidth[MODAL_WIDTH.MD]}
        title={<TitleRow>{copy.title}</TitleRow>}
        onCancel={onClose}
        footer={<Button onClick={onClose}>{copy.close}</Button>}
      >
        <Hint>{copy.description}</Hint>
        <OrphanList>
          {visibleOrphans.map(({ account, projects }) => (
            <OrphanRow key={account}>
              <OrphanAccount>{account}</OrphanAccount>
              <OrphanProjects>
                {projects.map((project) => (
                  <StatusBadge
                    key={project}
                    tone={STATUS_TONE.NEUTRAL}
                    label={project}
                    variant={STATUS_BADGE_VARIANT.CHIP}
                  />
                ))}
              </OrphanProjects>
              <Button
                aria-label={copy.clearFor(account)}
                disabled={clearingAccount === account}
                onClick={() => requestClear(account)}
              >
                {copy.clear}
              </Button>
            </OrphanRow>
          ))}
        </OrphanList>
      </Dialog>
      <ConfirmModal {...confirmProps} />
    </>
  );
};
