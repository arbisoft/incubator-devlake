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

export const Input = styled.div`
  margin-bottom: ${({ theme }) => theme.space.xs}px;

  .input {
    display: flex;
    align-items: center;

    .info {
      margin-left: ${({ theme }) => theme.space.xxs}px;

      span.error {
        color: ${({ theme }) => theme.colors.error};
      }

      span.success {
        color: ${({ theme }) => theme.colors.success};
      }
    }
  }

  .warning {
    margin-top: ${({ theme }) => theme.space.xs}px;
  }
`;

export const Alert = styled.div`
  margin-top: ${({ theme }) => theme.space.xs}px;
  padding: ${({ theme }) => theme.space.sm}px 20px;
  background: ${({ theme }) => theme.colors.bgLayout};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.sm}px;
`;
