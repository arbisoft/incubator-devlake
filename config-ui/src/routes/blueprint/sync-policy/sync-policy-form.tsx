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

import { Checkbox, Input, Radio } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';

import { getCronOptions } from '@/config/cron';
import { LINKS } from '@/config/links';
import { ExternalLink } from '@/ui/external-link';
import { FormField } from '@/ui/form-field';

import { COPY, CUSTOM_CRON_FIELDS, FREQUENCY } from './constants';
import { Columns, Controls, CronFields, ErrorText, Form, Hint, Note, RunList, StartDate, Stack } from './styled';
import type { SyncPolicyFormProps } from './types';
import {
  findQuickRange,
  getFrequencyChoice,
  getFrequencyPatch,
  getNextRunTime,
  getNextRuns,
  getQuickRanges,
  getTimezoneLabel,
  setCronField,
  splitCron,
  toUtcIso,
} from './utils';

const FREQUENCY_OPTIONS = getCronOptions();

export const SyncPolicyForm = ({ values, showTimeFilter, onChange }: SyncPolicyFormProps) => {
  const { isManual, cronConfig, skipOnFail, timeAfter } = values;
  const [quickRanges] = useState(() => getQuickRanges());
  const choice = getFrequencyChoice(isManual, cronConfig);
  const nextRuns = getNextRuns(isManual, cronConfig);
  const cronFields = splitCron(cronConfig);

  return (
    <Form>
      <Note>
        {COPY.timezone.prefix} <strong>{COPY.timezone.zone(getTimezoneLabel())}</strong>. {COPY.timezone.suffix}
      </Note>
      {showTimeFilter && (
        <FormField label={COPY.timeRange.label} description={COPY.timeRange.description}>
          {(control) => (
            <Stack>
              <Radio.Group
                optionType="button"
                aria-label={COPY.timeRange.quickLabel}
                value={findQuickRange(quickRanges, timeAfter)?.key}
                options={quickRanges.map(({ key, label }) => ({ value: key, label }))}
                onChange={({ target }) => {
                  const range = quickRanges.find(({ key }) => key === target.value);
                  if (range) onChange({ timeAfter: toUtcIso(range.date) });
                }}
              />
              <Controls>
                <StartDate
                  {...control}
                  value={timeAfter ? dayjs(timeAfter) : null}
                  placeholder={COPY.timeRange.placeholder}
                  onChange={(_, date) => onChange({ timeAfter: date ? toUtcIso(date as string) : null })}
                />
                <strong>{COPY.timeRange.toNow}</strong>
              </Controls>
            </Stack>
          )}
        </FormField>
      )}
      <Columns>
        <FormField label={COPY.frequency.label} description={COPY.frequency.description}>
          {(control) => (
            <Stack>
              <Radio.Group
                {...control}
                value={choice}
                onChange={({ target }) => onChange(getFrequencyPatch(target.value))}
              >
                <Stack>
                  {FREQUENCY_OPTIONS.map(({ label, subLabel }) => (
                    <Radio key={label} value={label}>
                      {[label, subLabel].filter(Boolean).join(' ')}
                    </Radio>
                  ))}
                </Stack>
              </Radio.Group>
              {choice === FREQUENCY.CUSTOM && (
                <>
                  <CronFields>
                    {CUSTOM_CRON_FIELDS.map((field, index) => (
                      <FormField key={field} label={field}>
                        {(fieldControl) => (
                          <Input
                            {...fieldControl}
                            value={cronFields[index]}
                            onChange={({ target }) =>
                              onChange({ cronConfig: setCronField(cronConfig, index, target.value) })
                            }
                          />
                        )}
                      </FormField>
                    ))}
                  </CronFields>
                  {!getNextRunTime(isManual, cronConfig) && (
                    <ErrorText role="alert">{COPY.frequency.invalid}</ErrorText>
                  )}
                </>
              )}
              <Note>
                <ExternalLink href={LINKS.CRON.HELP}>{COPY.frequency.helpLink}</ExternalLink> {COPY.frequency.or}{' '}
                <ExternalLink href={LINKS.CRON.AI}>{COPY.frequency.aiLink}</ExternalLink>
              </Note>
            </Stack>
          )}
        </FormField>
        <Stack>
          <strong>{COPY.frequency.nextRuns}</strong>
          {nextRuns.length ? (
            <RunList>
              {nextRuns.map((run) => (
                <li key={run}>{run}</li>
              ))}
            </RunList>
          ) : (
            <Note>{COPY.frequency.notAvailable}</Note>
          )}
        </Stack>
      </Columns>
      <Stack>
        <strong>{COPY.policy.label}</strong>
        <Checkbox checked={skipOnFail} onChange={({ target }) => onChange({ skipOnFail: target.checked })}>
          {COPY.policy.skipOnFail}
        </Checkbox>
        <Hint>{COPY.policy.skipOnFailHint}</Hint>
      </Stack>
    </Form>
  );
};
