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
  const { request, confirmProps } = useConfirmFlow<string>({
    resolve: (account) => ({ config: copy.confirm, name: account }),
    run: async (account, setLoading) => {
      const [success] = await operator(() => API.grafanaUsers.clearOrphan(account), {
        setOperating: setLoading,
        formatReason: getFlowError(GRAFANA_FLOW_ERRORS.ORPHAN),
      });
      onChanged();
      return success;
    },
  });

  return (
    <>
      <Dialog
        open={open && orphans.length > 0}
        centered
        destroyOnHidden
        width={layout.modalWidth[MODAL_WIDTH.MD]}
        title={<TitleRow>{copy.title}</TitleRow>}
        onCancel={onClose}
        footer={<Button onClick={onClose}>{copy.close}</Button>}
      >
        <Hint>{copy.description}</Hint>
        <OrphanList>
          {orphans.map(({ account, projects }) => (
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
              <Button aria-label={copy.clearFor(account)} onClick={() => request(account)}>
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
