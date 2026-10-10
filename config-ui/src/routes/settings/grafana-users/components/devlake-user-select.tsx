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

import { useDebounce } from 'ahooks';
import { Select } from 'antd';
import type { LabeledValue } from 'antd/es/select';
import { useState } from 'react';

import API from '@/api';
import { useRefreshData } from '@/hooks';
import { FormField } from '@/ui';

import { COPY, DEVLAKE_USER_SEARCH_PAGE_SIZE, SEARCH_DEBOUNCE_MS } from '../constants';
import type { DevlakeUserOption } from '../types';
import { toDevlakeUserOption } from '../utils';

import type { DevlakeUserSelectProps } from './types';

export const DevlakeUserSelect = ({ value, disabled, onPick }: DevlakeUserSelectProps) => {
  const [keyword, setKeyword] = useState('');
  const debounced = useDebounce(keyword, { wait: SEARCH_DEBOUNCE_MS });
  const found = useRefreshData(
    (signal) => API.access.listUsers({ keyword: debounced, page: 1, pageSize: DEVLAKE_USER_SEARCH_PAGE_SIZE }, signal),
    [debounced],
  );
  const options = (found.data?.users ?? []).map(toDevlakeUserOption);

  return (
    <FormField label={COPY.add.fillFrom.label}>
      {(control) => (
        <Select<LabeledValue, DevlakeUserOption>
          labelInValue
          id={control.id}
          size="large"
          showSearch={{ filterOption: false, onSearch: setKeyword }}
          allowClear
          disabled={disabled}
          placeholder={COPY.add.fillFrom.placeholder}
          notFoundContent={COPY.add.fillFrom.empty}
          loading={!found.ready && found.error === undefined}
          options={options}
          value={value}
          onChange={(_, option) => onPick(Array.isArray(option) ? undefined : option)}
        />
      )}
    </FormField>
  );
};
