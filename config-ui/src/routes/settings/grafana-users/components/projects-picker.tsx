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
import { useMemo, useState } from 'react';

import API from '@/api';
import { useRefreshData } from '@/hooks';
import { FormField } from '@/ui';

import { COPY, PROJECT_SEARCH_PAGE_SIZE, SEARCH_DEBOUNCE_MS } from '../constants';
import { buildProjectOptions } from '../utils';

import type { ProjectsPickerProps } from './types';

export const ProjectsPicker = ({ value, onChange }: ProjectsPickerProps) => {
  const [keyword, setKeyword] = useState('');
  const debounced = useDebounce(keyword, { wait: SEARCH_DEBOUNCE_MS });
  const found = useRefreshData(
    (signal) => API.project.list({ keyword: debounced, page: 1, pageSize: PROJECT_SEARCH_PAGE_SIZE }, signal),
    [debounced],
  );
  const options = useMemo(
    () => buildProjectOptions(value, found.data?.projects.map(({ name }) => name) ?? []),
    [value, found.data],
  );

  return (
    <FormField label={COPY.projects.label}>
      {(control) => (
        <Select<string[]>
          id={control.id}
          size="large"
          mode="multiple"
          showSearch={{ filterOption: false, onSearch: setKeyword }}
          allowClear
          placeholder={COPY.projects.placeholder}
          notFoundContent={COPY.projects.empty}
          loading={!found.ready && found.error === undefined}
          options={options}
          value={value}
          onChange={onChange}
          onOpenChange={(open) => !open && setKeyword('')}
        />
      )}
    </FormField>
  );
};
