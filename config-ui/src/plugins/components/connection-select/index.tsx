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

import { Select, SelectProps } from 'antd';
import styled from 'styled-components';

import { getPluginConfig } from '@/plugins';
import { PluginIcon } from '@/ui';

const Option = styled.div`
  display: flex;
  align-items: center;

  .name {
    margin-left: 8px;
    max-width: 90%;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }
`;

interface Props extends Omit<SelectProps, 'optionRender'> {}

export const ConnectionSelect = ({ ...props }: Props) => {
  return (
    <Select
      style={{ width: 384 }}
      placeholder="Select..."
      optionRender={(option) => {
        const plugin = getPluginConfig(option.data.plugin);
        return (
          <Option>
            <PluginIcon icon={plugin.icon} size="md" />
            <span className="name">{option.label}</span>
          </Option>
        );
      }}
      {...props}
    />
  );
};
