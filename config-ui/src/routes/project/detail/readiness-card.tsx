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

import { Button, Skeleton } from 'antd';
import { useNavigate } from 'react-router-dom';

import API from '@/api';
import { BLUEPRINT_VIEW, PATHS } from '@/config';
import { useRefreshData } from '@/hooks';
import { COMMON_COPY, EMPTY_ILLUSTRATION, EMPTY_STATE_SIZE, EmptyState, SectionCard, useRefreshVersion } from '@/ui';

import {
  COPY as READINESS_COPY,
  ReadinessMeter,
  SIGNAL_STATE,
  SignalStatusIcon,
  Tag,
  toReadinessMap,
} from '../readiness';

import { COPY } from './constants';
import {
  ReadinessNote,
  ReadinessPercent,
  ReadinessSummary,
  SignalAside,
  SignalCopy,
  SignalDescription,
  SignalList,
  SignalName,
  SignalNote,
  SignalRow,
  SourceTags,
  SummaryCount,
  SummaryMain,
} from './styled';
import type { ReadinessCardProps } from './types';

export const ReadinessCard = ({ projectName }: ReadinessCardProps) => {
  const { version, refresh } = useRefreshVersion();
  const navigate = useNavigate();
  const { data, ready, error } = useRefreshData((signal) => API.complianceScorecard.list(signal), [version]);
  const readiness = ready ? toReadinessMap(data?.rows).get(projectName) : undefined;
  const handleAdd = () => navigate(PATHS.PROJECT_BLUEPRINT_VIEW(projectName, BLUEPRINT_VIEW.CONFIGURATION));

  const renderBody = () => {
    if (error !== undefined) {
      return (
        <EmptyState
          illustration={EMPTY_ILLUSTRATION.ERROR}
          title={COPY.readiness.loadFailed}
          size={EMPTY_STATE_SIZE.SECTION}
          action={<Button onClick={refresh}>{COMMON_COPY.retry}</Button>}
        />
      );
    }
    if (!ready) return <Skeleton active paragraph={{ rows: 3 }} title={false} />;
    if (!readiness) {
      return <EmptyState {...COPY.readiness.empty} size={EMPTY_STATE_SIZE.SECTION} />;
    }
    return (
      <>
        <SignalList aria-label={COPY.readiness.listLabel}>
          {readiness.signals.map(({ key, state, sources }) => (
            <SignalRow key={key}>
              <SignalStatusIcon state={state} large />
              <SignalCopy>
                <SignalName>{READINESS_COPY.signals[key].name}</SignalName>
                <SignalDescription>{READINESS_COPY.signals[key].description}</SignalDescription>
              </SignalCopy>
              <SignalAside>
                {state === SIGNAL_STATE.AVAILABLE && sources.length > 0 && (
                  <SourceTags>
                    {sources.map((source) => (
                      <Tag key={source}>{source}</Tag>
                    ))}
                  </SourceTags>
                )}
                {state === SIGNAL_STATE.MISSING && (
                  <>
                    <SignalNote>{READINESS_COPY.notAvailable}</SignalNote>
                    <Button onClick={handleAdd}>{READINESS_COPY.addConnection}</Button>
                  </>
                )}
                {state === SIGNAL_STATE.UNKNOWN && <SignalNote>{READINESS_COPY.unknown}</SignalNote>}
              </SignalAside>
            </SignalRow>
          ))}
        </SignalList>
        <ReadinessNote role="note">{COPY.readiness.note}</ReadinessNote>
      </>
    );
  };

  return (
    <SectionCard
      title={READINESS_COPY.title}
      description={COPY.readiness.description}
      actions={
        readiness && (
          <ReadinessSummary>
            <SummaryMain>
              <ReadinessMeter readiness={readiness} large />
              <ReadinessPercent>{readiness.percentLabel ?? COMMON_COPY.emptyValue}</ReadinessPercent>
            </SummaryMain>
            <SummaryCount>{READINESS_COPY.summary(readiness.available, readiness.total)}</SummaryCount>
          </ReadinessSummary>
        )
      }
    >
      {renderBody()}
    </SectionCard>
  );
};
