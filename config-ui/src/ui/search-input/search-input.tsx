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

import { CloseCircleFilled, SearchOutlined } from '@ant-design/icons';
import { Button, Input } from 'antd';
import { useState } from 'react';

import { COMMON_COPY } from '@/ui/constants';

import { Compact } from './styled';
import type { SearchInputProps } from './types';

export const SearchInput = ({ value, placeholder, onSearch, allowClear }: SearchInputProps) => {
  const [draft, setDraft] = useState(value ?? '');
  const [synced, setSynced] = useState(value);

  if (value !== synced) {
    setSynced(value);
    setDraft(value ?? '');
  }

  const submit = () => onSearch(draft.trim());

  return (
    <Compact size="large">
      <Input
        value={draft}
        placeholder={placeholder}
        aria-label={placeholder}
        allowClear={allowClear && { clearIcon: <CloseCircleFilled aria-label={COMMON_COPY.clear} /> }}
        onChange={(event) => {
          setDraft(event.target.value);
          if (!event.target.value && allowClear && event.type === 'click') onSearch('');
        }}
        onPressEnter={submit}
      />
      <Button type="primary" icon={<SearchOutlined />} aria-label={COMMON_COPY.search} onClick={submit} />
    </Compact>
  );
};
