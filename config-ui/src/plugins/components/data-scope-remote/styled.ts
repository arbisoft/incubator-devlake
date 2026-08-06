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

import styled from 'styled-components';

export const Wrapper = styled.div``;

export const ColumnTitle = styled.div`
  padding: 6px 12px;
  font-weight: 600;
`;

export const SelectedScopes = styled.div`
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fafafa;
  color: #8c8c8c;

  .ant-tag {
    margin-inline-end: 0;
  }
`;

export const JobLoad = styled.div`
  display: flex;
  align-items: center;

  & > span.count {
    margin: 0 8px;
    color: #7497f7;
  }
`;
