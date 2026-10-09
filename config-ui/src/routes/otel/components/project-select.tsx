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

import { Select } from 'antd';
import { useMemo } from 'react';

import { FormField } from '@/ui';

import type { ProjectSelectFieldProps, ProjectSelectProps } from '../types';

import { COPY } from './constants';

const ProjectSelect = ({ id, value, options, onChange, ...aria }: ProjectSelectProps) => {
  const items = useMemo(() => options.map(({ name }) => ({ value: name, label: name })), [options]);
  return (
    <Select<string[]>
      id={id}
      {...aria}
      mode="multiple"
      allowClear
      showSearch
      optionFilterProp="label"
      popupMatchSelectWidth
      placeholder={COPY.create.projects.placeholder}
      value={value}
      options={items}
      onChange={onChange}
    />
  );
};

export const ProjectSelectField = ({ label, description, value, options, onChange }: ProjectSelectFieldProps) => (
  <FormField label={label} description={description} required>
    {(control) => <ProjectSelect {...control} value={value} options={options} onChange={onChange} />}
  </FormField>
);
