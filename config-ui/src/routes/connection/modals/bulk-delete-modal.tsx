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

import { Progress } from 'antd';

import { FormModal } from '@/ui';

import { DETAIL_COPY } from '../constants';
import { summarizeBulkDelete } from '../delete-utils';
import type { BulkDeleteState } from '../types';

import { FailureList, Lead, Section, SectionTitle } from './styled';

type BulkDeleteModalProps = {
  state: BulkDeleteState;
  onClose: () => void;
  afterClose: () => void;
};

export const BulkDeleteModal = ({ state, onClose, afterClose }: BulkDeleteModalProps) => {
  const { open, running, total, completed, outcomes } = state;
  const { succeeded, failures } = summarizeBulkDelete(outcomes);
  const copy = DETAIL_COPY.bulk;

  return (
    <FormModal
      open={open}
      title={copy.title}
      submitLabel={copy.close}
      showCancel={false}
      loading={running}
      onSubmit={onClose}
      onCancel={onClose}
      afterClose={afterClose}
    >
      <Lead>{copy.description}</Lead>
      <Section>
        <SectionTitle>{copy.progress(completed, total)}</SectionTitle>
        <Progress
          aria-label={copy.progressLabel}
          percent={total === 0 ? 0 : Math.round((completed / total) * 100)}
          showInfo={false}
          status={running ? 'active' : undefined}
        />
      </Section>
      {!running && total > 0 && (
        <Section>
          <SectionTitle>{copy.summary}</SectionTitle>
          <Lead>{`${copy.succeeded}: ${succeeded}`}</Lead>
          <Lead>{`${copy.failed}: ${failures.length}`}</Lead>
        </Section>
      )}
      {failures.length > 0 && (
        <Section>
          <SectionTitle>{copy.failures}</SectionTitle>
          <FailureList>
            {failures.map(({ id, name, error }) => (
              <li key={id}>{copy.failure(name, error ?? '')}</li>
            ))}
          </FailureList>
        </Section>
      )}
    </FormModal>
  );
};
