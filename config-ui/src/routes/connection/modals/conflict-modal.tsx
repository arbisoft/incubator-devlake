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

import { FormModal } from '@/ui';

import { CONFLICT_KIND, DETAIL_COPY } from '../constants';
import type { ConflictState } from '../types';

import { Lead, NameList } from './styled';

type ConflictModalProps = {
  open: boolean;
  conflict?: ConflictState;
  onClose: () => void;
};

export const ConflictModal = ({ open, conflict, onClose }: ConflictModalProps) => {
  const copy = DETAIL_COPY.conflict[conflict?.kind ?? CONFLICT_KIND.CONNECTION];
  const names = conflict?.names ?? [];

  return (
    <FormModal
      open={open}
      title={copy.title}
      submitLabel={DETAIL_COPY.conflict.close}
      showCancel={false}
      onSubmit={onClose}
      onCancel={onClose}
    >
      {names.length === 0 ? (
        <Lead>{DETAIL_COPY.conflict.generic}</Lead>
      ) : (
        <>
          <Lead>{copy.body}</Lead>
          <NameList>
            {names.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </NameList>
        </>
      )}
    </FormModal>
  );
};
