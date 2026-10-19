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

export const GeneratedKeyText = styled.pre`
  margin: 0;
  padding: ${({ theme }) => theme.space.md}px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.primarySubtle};
  border-radius: ${({ theme }) => theme.radius.lg}px;
  font-family: ${({ theme }) => theme.typography.monoFamily};
`;
