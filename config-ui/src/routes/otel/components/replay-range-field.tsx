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

import dayjs from 'dayjs';

import { FormField } from '@/ui';

import { REPLAY_DAY_FORMAT } from '../replay-constants';
import { ReplayRange } from '../styled';
import type { ReplayRangeFieldProps } from '../types';
import { includesToday, isReplayDayDisabled } from '../utils';

import { COPY } from './constants';

export const ReplayRangeField = ({ value, limits, onChange }: ReplayRangeFieldProps) => {
  const description = [COPY.range.hint(limits.min, limits.max), includesToday(value, limits) && COPY.range.today]
    .filter(Boolean)
    .join(' ');

  return (
    <FormField label={COPY.range.label} description={description}>
      {(control) => (
        <ReplayRange
          {...control}
          format={REPLAY_DAY_FORMAT}
          allowClear={false}
          value={[dayjs(value.startDate), dayjs(value.endDate)]}
          disabledDate={(day) => isReplayDayDisabled(day.format(REPLAY_DAY_FORMAT), limits)}
          onChange={(range) => {
            const [start, end] = range ?? [];
            if (start && end)
              onChange({ startDate: start.format(REPLAY_DAY_FORMAT), endDate: end.format(REPLAY_DAY_FORMAT) });
          }}
        />
      )}
    </FormField>
  );
};
