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

import { Modal } from 'antd';
import styled, { css, type DefaultTheme } from 'styled-components';

import { WEIGHT } from '@/theme/scales';
import { scrollableModal, textStyle } from '@/ui/style-helpers';

import { STAGE_STATE } from '../constants';
import type { StageState } from '../types';

export const HeadingRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space.md}px;
`;

export const Heading = styled.h3`
  ${textStyle('h3')}
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

export const Mime = styled.span`
  ${textStyle('caption')}
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Description = styled.p`
  ${textStyle('body')}
  margin: ${({ theme }) => theme.space.xxs}px 0 ${({ theme }) => theme.space.md}px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const StatusStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xxs}px;
`;

const stateColors = ({ colors }: DefaultTheme): Record<StageState, { border: string; text: string; bg: string }> => ({
  [STAGE_STATE.SUCCESS]: { border: colors.borderSubtle, text: colors.successText, bg: colors.successBg },
  [STAGE_STATE.LOADING]: { border: colors.infoText, text: colors.infoText, bg: colors.infoTintBg },
  [STAGE_STATE.ERROR]: { border: colors.errorActive, text: colors.errorActive, bg: colors.errorBg },
  [STAGE_STATE.CANCEL]: { border: colors.borderSubtle, text: colors.textSecondary, bg: colors.bgTableHeader },
  [STAGE_STATE.READY]: { border: colors.borderSubtle, text: colors.textSecondary, bg: colors.bgTableHeader },
});

const TINTED_STATES: StageState[] = [STAGE_STATE.LOADING, STAGE_STATE.ERROR];

export const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm}px;
  min-width: 0;
`;

export const Summary = styled.dl`
  display: flex;
  align-items: stretch;
  margin: 0;
  background: ${({ theme }) => theme.colors.bgContainer};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.lg}px;
  overflow: hidden;
`;

export const SummaryCell = styled.div`
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xxs}px;
  min-width: 0;
  padding: ${({ theme }) => theme.space.md}px;

  & + & {
    border-left: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  }
`;

export const SummaryLabel = styled.dt`
  ${textStyle('captionStrong')}
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const SummaryValue = styled.dd`
  ${textStyle('h3')}
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
  overflow-wrap: anywhere;
`;

export const SummaryActions = styled.div`
  display: flex;
  align-items: center;
  padding: 0 ${({ theme }) => theme.space.md}px;
  border-left: 1px solid ${({ theme }) => theme.colors.borderSubtle};
`;

export const FailedNote = styled.p`
  ${textStyle('body')}
  margin: 0;
  color: ${({ theme }) => theme.colors.errorActive};
`;

export const Stages = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const Stage = styled.li<{ $state: StageState }>`
  overflow: hidden;
  background: ${({ theme }) => theme.colors.bgContainer};
  border: 1px solid ${({ $state, theme }) => stateColors(theme)[$state].border};
  border-radius: ${({ theme }) => theme.radius.lg}px;
`;

export const StageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space.md}px;
  padding: ${({ theme }) => theme.space.md}px ${({ theme }) => theme.space.md}px;
`;

export const StageTitle = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs}px;
  min-width: 0;
`;

export const StageName = styled.h4`
  ${textStyle('h3')}
  font-weight: ${WEIGHT.medium};
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

export const StageNote = styled.span`
  ${textStyle('caption')}
  color: ${({ theme }) => theme.colors.errorActive};
`;

export const StageDot = styled.span<{ $state: StageState }>`
  flex: none;
  width: ${({ theme }) => theme.layout.stageDotSize}px;
  height: ${({ theme }) => theme.layout.stageDotSize}px;
  border-radius: ${({ theme }) => theme.radius.pill}px;
  background: ${({ $state, theme }) => stateColors(theme)[$state].text};
  box-shadow: 0 0 0 ${({ theme }) => theme.space.xxs}px ${({ $state, theme }) => stateColors(theme)[$state].bg};
`;

export const StageMeta = styled.div`
  ${textStyle('caption')}
  display: flex;
  flex: none;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm}px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const StageLabel = styled.span<{ $state: StageState }>`
  ${textStyle('captionStrong')}
  padding-left: ${({ theme }) => theme.space.sm}px;
  border-left: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  text-transform: uppercase;
  color: ${({ $state, theme }) => stateColors(theme)[$state].text};
`;

export const TaskList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
`;

export const Task = styled.li<{ $state: StageState; $inactive: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.md}px;
  padding: ${({ theme }) => theme.space.sm}px ${({ theme }) => theme.space.md}px;
  background: ${({ $state, theme }) => (TINTED_STATES.includes($state) ? stateColors(theme)[$state].bg : 'transparent')};

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  }

  ${({ $inactive, theme }) =>
    $inactive &&
    css`
      color: ${theme.colors.textSecondary};
      font-style: italic;
    `}
`;

export const TaskId = styled.span`
  ${textStyle('caption')}
  flex: none;
  width: ${({ theme }) => theme.layout.pipelineTaskIdWidth}px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const TaskName = styled.div`
  ${textStyle('bodyMedium')}
  flex: 1 1 0;
  min-width: 0;
  color: inherit;
`;

export const TaskTime = styled.span`
  ${textStyle('caption')}
  flex: none;
  width: ${({ theme }) => theme.layout.pipelineTaskDurationWidth}px;
  text-align: right;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const TaskCell = styled.div`
  ${textStyle('captionStrong')}
  flex: none;
  width: ${({ theme }) => theme.layout.pipelineProgressWidth}px;
  min-width: 0;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const TaskFailed = styled.span`
  color: ${({ theme }) => theme.colors.errorActive};
`;

export const TaskAction = styled.div`
  flex: none;
  min-width: ${({ theme }) => theme.layout.avatarSize}px;
`;

export const DetailDialog = styled(Modal)`
  ${scrollableModal}

  .ant-modal-title {
    ${textStyle('h3')}
  }
`;

export const PanelLoading = styled.div`
  display: flex;
  justify-content: center;
  padding: ${({ theme }) => theme.space.lg}px;
`;
