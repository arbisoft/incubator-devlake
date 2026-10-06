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

import { COPY, FILTER_TABS_VARIANT } from './constants';
import { FlatTabs, PillTabs } from './styled';
import type { FilterTabItem, FilterTabsProps } from './types';

const labelOf = ({ label, count }: FilterTabItem) => (count === undefined ? label : COPY.withCount(label, count));

export const FilterTabs = ({ items, value, onChange, variant }: FilterTabsProps) =>
  variant === FILTER_TABS_VARIANT.PILL ? (
    <PillTabs
      value={value}
      options={items.map((item) => ({ value: item.key, label: labelOf(item) }))}
      onChange={(key) => onChange(String(key))}
    />
  ) : (
    <FlatTabs
      type="card"
      activeKey={value}
      items={items.map((item) => ({ key: item.key, label: labelOf(item) }))}
      onChange={onChange}
    />
  );
