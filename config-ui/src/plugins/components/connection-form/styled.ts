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

export const Root = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space.lg}px;
`;

export const Actions = styled.div`
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  padding-block: ${({ theme }) => theme.space.sm}px;
  background: ${({ theme }) => theme.colors.bgElevated};
  border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  gap: ${({ theme }) => theme.space.sm}px;
`;
