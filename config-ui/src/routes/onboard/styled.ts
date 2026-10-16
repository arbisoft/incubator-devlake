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

import { Input } from 'antd';
import styled from 'styled-components';

import { Markdown } from '@/components';
import { paddedCardSurface, textStyle, toneColors } from '@/ui/style-helpers';
import type { StatusTone } from '@/ui/types';

export const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.bgLayout};
`;

export const Inner = styled.div`
  margin: 0 auto;
  padding: ${({ theme }) => theme.space.xl}px 0;
  width: ${({ theme }) => theme.layout.wizardWidth}px;
  max-width: 100%;
`;

export const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const Title = styled.h1`
  ${textStyle('h1')}
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

export const Content = styled.div`
  margin: 0 auto;
  width: ${({ theme }) => theme.layout.wizardContentWidth}px;
  max-width: 100%;
`;

export const Step = styled.ul`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: ${({ theme }) => theme.space.xxl}px 0;
  padding: 0;
  list-style: none;
`;

export const StepItem = styled.li<{ $activated: boolean }>`
  ${({ $activated }) => ($activated ? textStyle('h2') : textStyle('body'))}
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;
  position: relative;
  color: ${({ theme }) => theme.colors.text};

  & > span:first-child {
    display: flex;
    align-items: center;
    justify-content: center;
    width: ${({ theme }) => theme.layout.wizardStepMarkSize}px;
    height: ${({ theme }) => theme.layout.wizardStepMarkSize}px;
    font-size: inherit;
    color: ${({ theme, $activated }) => ($activated ? theme.colors.textInverse : theme.colors.textSecondary)};
    background: ${({ theme, $activated }) => ($activated ? theme.colors.primary : 'transparent')};
    border: 1px solid ${({ theme, $activated }) => ($activated ? theme.colors.primary : theme.colors.border)};
    border-radius: ${({ theme }) => theme.radius.pill}px;
  }

  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: calc(-1 * (${({ theme }) => theme.layout.wizardConnectorWidth + theme.space.xxl}px));
    width: ${({ theme }) => theme.layout.wizardConnectorWidth}px;
    height: 1px;
    background: ${({ theme }) => theme.colors.border};
  }

  &:first-child::before {
    display: none;
  }
`;

export const StepContent = styled.div`
  display: flex;
  height: ${({ theme }) => theme.layout.wizardPanelHeight}px;
  background: ${({ theme }) => theme.colors.bgContainer};
  border: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  border-radius: ${({ theme }) => theme.radius.lg}px;
`;

export const Form = styled.div`
  flex: 0 0 ${({ theme }) => theme.layout.wizardFormWidth}px;
  padding: ${({ theme }) => theme.space.lg}px;
  overflow-y: auto;

  a {
    color: ${({ theme }) => theme.colors.link};
  }
`;

export const NameInput = styled(Input)`
  max-width: ${({ theme }) => theme.layout.fieldMaxWidth}px;
`;

export const Guide = styled(Markdown)`
  ${textStyle('body')}
  flex: auto;
  margin: ${({ theme }) => theme.space.sm}px 0;
  padding: 0 ${({ theme }) => theme.space.lg}px;
  border-left: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  overflow-y: auto;

  a {
    color: ${({ theme }) => theme.colors.link};
  }

  img {
    width: 100%;
  }

  h5 {
    margin: ${({ theme }) => theme.space.md}px 0;
  }

  ul {
    padding-left: 1em;
    list-style: disc;
  }

  ol {
    padding-left: 1.5em;
  }

  li {
    ${textStyle('caption')}
  }

  p {
    color: ${({ theme }) => theme.colors.textSecondary};
  }

  code {
    ${textStyle('caption')}
    padding: 0 ${({ theme }) => theme.space.xxs}px;
    font-family: ${({ theme }) => theme.typography.monoFamily};
    border-radius: ${({ theme }) => theme.radius.sm}px;
    border: 1px solid ${({ theme }) => theme.colors.borderSubtle};
    background: ${({ theme }) => theme.colors.bgCode};
  }
`;

export const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  margin-top: ${({ theme }) => theme.space.xl}px;
`;

export const Connect = styled.div`
  margin-top: ${({ theme }) => theme.space.md}px;
`;

export const Hero = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
`;

export const HeroBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.layout.wizardSectionGap}px;
`;

export const Welcome = styled.h1`
  ${textStyle('display')}
  margin: 0 0 ${({ theme }) => theme.space.lg}px;
  color: ${({ theme }) => theme.colors.text};

  & > span {
    color: ${({ theme }) => theme.colors.iconBrand};
  }
`;

export const Subtitle = styled.p`
  ${textStyle('bodyLarge')}
  margin: 0 0 ${({ theme }) => theme.space.xxl}px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Start = styled.div`
  width: ${({ theme }) => theme.layout.wizardActionWidth}px;
  max-width: 100%;
`;

export const Result = styled.div`
  margin-top: ${({ theme }) => theme.layout.wizardSectionGap}px;
  ${paddedCardSurface}
`;

export const ResultTop = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space.md}px;
  margin-bottom: ${({ theme }) => theme.space.xxl}px;
  text-align: center;
`;

export const ResultInfo = styled.div`
  ${textStyle('h3')}
  color: ${({ theme }) => theme.colors.text};
`;

export const ResultTip = styled.div`
  ${textStyle('caption')}
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const ResultActions = styled.div<{ $column?: boolean }>`
  display: flex;
  flex-direction: ${({ $column }) => ($column ? 'column' : 'row')};
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;
`;

export const ResultIcon = styled.span<{ $tone: StatusTone }>`
  display: inline-flex;
  font-size: ${({ theme }) => theme.layout.wizardResultSize}px;
  color: ${({ theme, $tone }) => toneColors(theme)[$tone].text};
`;

export const LogsTitle = styled.div`
  ${textStyle('captionStrong')}
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const LogsDetail = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space.md}px;
  margin-top: ${({ theme }) => theme.space.sm}px;

  & > div {
    flex: 1;
  }
`;
