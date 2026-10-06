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
  display: flex;
  height: 100%;
  background: ${({ theme }) => theme.colors.bgContainer};
`;

export const Column = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  overflow-y: auto;
`;

export const Main = styled.main`
  flex: 1;
  padding: ${({ theme }) => theme.space.lg}px ${({ theme }) => theme.layout.contentGutter}px;
`;

export const Banner = styled.div`
  margin-bottom: ${({ theme }) => theme.space.lg}px;
`;
