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

import { Alert } from 'antd';
import { useEffect, useMemo, useRef } from 'react';

import { DataTable, EMPTY_STATE_SIZE, SectionCard } from '@/ui';

import { COPY } from '../constants';
import { BulletList, Help, Stack, TableFrame } from '../styled';
import type { AwsTestResult, ResultRow } from '../types';

import { RESULT_COLUMNS } from './columns';
import { toResultRows } from './rows';

export const AwsTestResultView = ({ result }: { result: AwsTestResult }) => {
  const rows = useMemo(() => toResultRows(result.checks), [result.checks]);
  const anchor = useRef<HTMLDivElement>(null);

  // The result renders below a long form, so bring it into view when a Test finishes.
  useEffect(() => {
    anchor.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [result]);

  return (
    <div ref={anchor}>
      <SectionCard title={COPY.testResult.title}>
        <Stack>
          {!result.success && result.message && <Alert type="error" showIcon title={result.message} />}
          {result.accountId && <Help>{COPY.testResult.account(result.accountId)}</Help>}
          {result.warnings && result.warnings.length > 0 && (
            <Alert
              type="warning"
              showIcon
              title={COPY.testResult.warnings}
              description={
                <BulletList>
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </BulletList>
              }
            />
          )}
          <TableFrame>
            <DataTable<ResultRow>
              rowKey="key"
              ariaLabel={COPY.testResult.ariaLabel}
              loading={false}
              columns={RESULT_COLUMNS}
              dataSource={rows}
              pagination={false}
              empty={{ title: COPY.testResult.empty, size: EMPTY_STATE_SIZE.SECTION }}
            />
          </TableFrame>
        </Stack>
      </SectionCard>
    </div>
  );
};
