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

import { Link } from 'react-router-dom';
import { useTheme } from 'styled-components';

import { BLUEPRINT_VIEW, PATHS } from '@/config';

import {
  COPY as READINESS_COPY,
  ReadinessMeter,
  SIGNAL_STATE,
  SignalStatusIcon,
  getMissingHint,
} from '../../readiness';
import { COPY } from '../constants';
import {
  PercentLabel,
  PopoverBody,
  PopoverFooter,
  PopoverHead,
  PopoverList,
  PopoverRow,
  PopoverSubtitle,
  RowCopy,
  RowTitle,
  SourceText,
} from '../styled';

import type { ReadinessPopoverProps } from './types';

const sourceText = (state: string, sources: string[]) => {
  if (sources.length > 0) return sources.join(', ');
  return state === SIGNAL_STATE.UNKNOWN ? READINESS_COPY.unknown : READINESS_COPY.notAvailable;
};

export const ReadinessPopover = ({ readiness }: ReadinessPopoverProps) => {
  const { layout } = useTheme();
  const hint = getMissingHint(readiness);
  return (
    <PopoverBody $width={layout.readinessPopoverWidth}>
      <PopoverHead>
        {READINESS_COPY.title}
        <ReadinessMeter readiness={readiness} />
        {readiness.percentLabel && <PercentLabel>{readiness.percentLabel}</PercentLabel>}
      </PopoverHead>
      <PopoverSubtitle>{COPY.readinessPopover.projectSummary(readiness.available, readiness.total)}</PopoverSubtitle>
      <PopoverList>
        {readiness.signals.map(({ key, state, sources }) => (
          <PopoverRow key={key}>
            <SignalStatusIcon state={state} />
            <RowCopy>
              <RowTitle>{READINESS_COPY.signals[key].name}</RowTitle>
            </RowCopy>
            <SourceText>{sourceText(state, sources)}</SourceText>
          </PopoverRow>
        ))}
      </PopoverList>
      {hint && (
        <PopoverFooter>
          <span>{hint}</span>
          <Link to={PATHS.PROJECT_BLUEPRINT_VIEW(readiness.project, BLUEPRINT_VIEW.CONFIGURATION)}>
            {READINESS_COPY.addConnection}
          </Link>
        </PopoverFooter>
      )}
    </PopoverBody>
  );
};
