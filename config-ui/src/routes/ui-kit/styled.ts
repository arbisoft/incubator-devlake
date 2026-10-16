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

import { paddedCardSurface, textStyle } from '@/ui/style-helpers';

export const Page = styled.main`
  min-height: 100vh;
  padding: ${({ theme }) => theme.layout.contentGutter}px;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.bgLayout};
`;

export const Header = styled.header`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space.md}px;
  margin-bottom: ${({ theme }) => theme.space.lg}px;
`;

export const PageTitle = styled.h1`
  ${textStyle('h1')}
  margin: 0;
`;

export const Section = styled.section`
  margin-bottom: ${({ theme }) => theme.space.xl}px;
  ${paddedCardSurface}
`;

export const SectionTitle = styled.h2`
  ${textStyle('h2')}
  margin: 0 0 ${({ theme }) => theme.space.md}px;
`;

export const Cases = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.lg}px;
`;

export const CaseBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs}px;
`;

export const CaseLabel = styled.span`
  ${textStyle('captionStrong')}
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.md}px;
`;

export const TopRow = styled(Row)`
  align-items: flex-start;
`;

export const Narrow = styled.div`
  width: ${({ theme }) => theme.layout.sidebarWidth}px;
  max-width: 100%;
  padding: ${({ theme }) => theme.space.xs}px;
  border: 1px dashed ${({ theme }) => theme.colors.border};
`;

export const Framed = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.lg}px;
`;

export const Mono = styled.pre`
  ${textStyle('caption')}
  margin: 0;
  font-family: ${({ theme }) => theme.typography.monoFamily};
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: pre-wrap;
`;

export const ScrollBox = styled.div`
  height: ${({ theme }) => theme.layout.sidebarWidth}px;
  overflow-y: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md}px;
`;

export const Spacer = styled.div`
  height: ${({ theme }) => theme.layout.drawerWidth / 2}px;
  padding: ${({ theme }) => theme.space.md}px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Target = styled.div`
  padding: ${({ theme }) => theme.space.md}px;
  color: ${({ theme }) => theme.colors.onSelected};
  background: ${({ theme }) => theme.colors.selectedBg};
`;

export const DarkBox = styled.div<{ $wide?: boolean }>`
  width: ${({ theme, $wide }) => ($wide ? theme.layout.sidebarWidth : theme.layout.sidebarRailWidth)}px;
  color: ${({ theme }) => theme.sidebar.text};
  background: ${({ theme }) => theme.sidebar.bg};
`;

export const Box = styled.div`
  height: ${({ theme }) => theme.layout.drawerWidth}px;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.lg}px;
`;

export const BoxNarrow = styled(Box)`
  width: ${({ theme }) => theme.layout.drawerWidth - theme.layout.sidebarWidth}px;
  max-width: 100%;
`;

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.md}px;
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(${({ theme }) => theme.layout.sidebarWidth}px, 1fr));
  gap: ${({ theme }) => theme.space.md}px;
`;

export const NarrowCard = styled(Narrow)`
  padding: 0;
  border: 0;
`;

export const BrandBackdrop = styled(Narrow)`
  padding: ${({ theme }) => theme.space.md}px;
  color: ${({ theme }) => theme.sidebar.text};
  background: ${({ theme }) => theme.sidebar.bg};
  border: 0;
`;
