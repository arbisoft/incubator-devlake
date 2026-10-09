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

export const Page = styled.main`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: ${({ theme }) => theme.layout.contentGutter}px;
  box-sizing: border-box;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.bgLayout};
`;

export const Panel = styled.div`
  width: 100%;
  max-width: ${({ theme }) => theme.layout.standalonePanelWidth}px;
  background: ${({ theme }) => theme.colors.bgContainer};
  border: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  border-radius: ${({ theme }) => theme.radius.lg}px;
`;

export const Split = styled.main`
  display: flex;
  min-height: 100vh;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.bgContainer};

  @media (max-width: ${({ theme }) => theme.layout.breakpointTablet - 1}px) {
    flex-direction: column;
  }
`;

export const Aside = styled.aside`
  position: relative;
  display: flex;
  flex: 0 0 ${({ theme }) => theme.layout.authAsideWidth}px;
  flex-direction: column;
  overflow: hidden;
  color: ${({ theme }) => theme.sidebar.text};
  background: ${({ theme }) => theme.sidebar.bg};

  &::before {
    content: '';
    position: absolute;
    bottom: ${({ theme }) => theme.layout.authGlowInsetBottom}px;
    left: ${({ theme }) => theme.layout.authGlowInsetX}px;
    width: ${({ theme }) => theme.layout.authGlowSize}px;
    height: ${({ theme }) => theme.layout.authGlowSize}px;
    background: ${({ theme }) => theme.colors.primary};
    border-radius: 50%;
    opacity: ${({ theme }) => theme.layout.authGlowOpacity};
    filter: blur(${({ theme }) => theme.layout.authGlowBlur}px);
    pointer-events: none;
  }

  > * {
    position: relative;
  }

  @media (max-width: ${({ theme }) => theme.layout.breakpointTablet - 1}px) {
    flex: none;
  }
`;

export const Content = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: ${({ theme }) => theme.layout.contentGutter}px;
  box-sizing: border-box;
`;
