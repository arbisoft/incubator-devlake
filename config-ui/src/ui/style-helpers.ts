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

import { css, type DefaultTheme } from 'styled-components';

import { STATUS_TONE } from './constants';
import type { StatusTone } from './types';

type TextStyleKey = keyof DefaultTheme['typography']['scale'];

export const textStyle =
  (key: TextStyleKey) =>
  ({ theme }: { theme: DefaultTheme }) => {
    const { fontSize, lineHeight, fontWeight, letterSpacing } = theme.typography.scale[key];
    return css`
      font-size: ${fontSize}px;
      line-height: ${lineHeight}px;
      font-weight: ${fontWeight};
      letter-spacing: ${letterSpacing}px;
    `;
  };

export const visuallyHidden = css`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;

export const focusRingStyle = ({ theme }: { theme: DefaultTheme }) => css`
  outline: ${theme.layout.focusRingWidth}px solid ${theme.colors.focusRing};
  outline-offset: ${theme.layout.focusRingWidth}px;
`;

export const motionTransition =
  (...properties: string[]) =>
  ({ theme }: { theme: DefaultTheme }) => css`
    transition: ${properties.map((property) => `${property} ${theme.motion.base}ms ${theme.motion.easing}`).join(', ')};

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  `;

type ToneColors = { text: string; bg: string; dot: string };

export const toneColors = ({ colors }: DefaultTheme): Record<StatusTone, ToneColors> => ({
  [STATUS_TONE.SUCCESS]: { text: colors.successText, bg: colors.successBg, dot: colors.success },
  [STATUS_TONE.WARNING]: { text: colors.warningText, bg: colors.warningBg, dot: colors.warning },
  [STATUS_TONE.ERROR]: { text: colors.errorActive, bg: colors.errorBg, dot: colors.error },
  [STATUS_TONE.INFO]: { text: colors.infoText, bg: colors.infoTintBg, dot: colors.infoText },
  [STATUS_TONE.NEUTRAL]: { text: colors.textSecondary, bg: colors.bgTableHeader, dot: colors.textSecondary },
});

// Keeps a modal inside the viewport: the header and footer stay put and the body scrolls.
export const scrollableModal = ({ theme }: { theme: DefaultTheme }) => {
  // Keep the full shared focus outline visible while preserving the modal's content box.
  const focusRingGutter = theme.layout.focusRingWidth * 2;

  return css`
    .ant-modal-container {
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - ${theme.layout.modalViewportMargin * 2}px);
    }

    .ant-modal-body {
      flex: 1 1 auto;
      min-height: 0;
      margin: -${focusRingGutter}px;
      padding: ${focusRingGutter}px;
      scroll-padding: ${focusRingGutter}px;
      overflow-y: auto;
    }
  `;
};

export const paddedCardSurface = ({ theme }: { theme: DefaultTheme }) => css`
  padding: ${theme.space.lg}px;
  background: ${theme.colors.bgContainer};
  border: 1px solid ${theme.colors.borderSubtle};
  border-radius: ${theme.radius.lg}px;
`;
