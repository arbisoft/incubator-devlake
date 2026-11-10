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

import { useTheme } from 'styled-components';

import type { AppThemeColors } from '@/theme';
import type { ResolvedTheme } from '@/theme/tokens';

import { CONNECTOR_LOGO_KIND } from './constants';
import { Icon } from './styled';
import type { PluginIconProps } from './types';

type MarkProps = Pick<PluginIconProps, 'icon' | 'logo'> & { colors: AppThemeColors; mode: ResolvedTheme };

const renderMark = ({ icon, logo, colors, mode }: MarkProps) => {
  if (!logo) return icon({ color: colors.iconBrand });
  if (logo.Svg) return <logo.Svg />;
  return icon({ color: logo.kind === CONNECTOR_LOGO_KIND.TINT ? logo.color[mode] : colors.text });
};

export const PluginIcon = ({ icon, size, logo }: PluginIconProps) => {
  const { colors, mode } = useTheme();
  return (
    <Icon
      $size={size}
      $mono={logo?.kind === CONNECTOR_LOGO_KIND.MONO}
      $color={logo?.kind === CONNECTOR_LOGO_KIND.TINT ? logo.color[mode] : undefined}
      $invert={logo?.kind === CONNECTOR_LOGO_KIND.LOGO && logo.invertInDark && mode === 'dark'}
      aria-hidden
    >
      {renderMark({ icon, logo, colors, mode })}
    </Icon>
  );
};
