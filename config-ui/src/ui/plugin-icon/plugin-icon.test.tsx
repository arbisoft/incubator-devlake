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

import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CONNECTOR_BRAND_COLORS } from '@/theme';
import { getTheme } from '@/theme/tokens';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { CONNECTOR_LOGO_KIND } from './constants';
import { PluginIcon } from './plugin-icon';
import type { ConnectorLogo } from './types';

type SvgComponent = NonNullable<Extract<ConnectorLogo, { kind: 'tint' }>['Svg']>;

const LOGO_TEST_ID = 'brand-logo';
const PLUGIN_TEST_ID = 'plugin-icon';
const light = getTheme('light');

const TINT_COLOR = CONNECTOR_BRAND_COLORS.hubspot;
const TestSvg: SvgComponent = (props) => <svg data-testid={LOGO_TEST_ID} {...props} />;

const logo = (kind: typeof CONNECTOR_LOGO_KIND.LOGO | typeof CONNECTOR_LOGO_KIND.MONO): ConnectorLogo => ({
  Svg: TestSvg,
  kind,
});

const colourOf = (value: string) => {
  const probe = document.createElement('i');
  probe.style.color = value;
  return probe.style.color;
};

describe('PluginIcon', () => {
  it('renders the logo instead of the plugin icon', () => {
    const icon = vi.fn(() => <svg data-testid={PLUGIN_TEST_ID} />);
    renderWithTheme(<PluginIcon icon={icon} size="md" logo={logo(CONNECTOR_LOGO_KIND.LOGO)} />);
    expect(screen.getByTestId(LOGO_TEST_ID)).toBeTruthy();
    expect(screen.queryByTestId(PLUGIN_TEST_ID)).toBeNull();
    expect(icon).not.toHaveBeenCalled();
  });

  it('colours a mono logo with the theme text colour', () => {
    renderWithTheme(<PluginIcon icon={() => null} size="md" logo={logo(CONNECTOR_LOGO_KIND.MONO)} />);
    const wrapper = screen.getByTestId(LOGO_TEST_ID).parentElement as HTMLElement;
    const probe = document.createElement('i');
    probe.style.color = light.colors.text;
    expect(getComputedStyle(wrapper).color).toBe(probe.style.color);
  });

  it('falls back to the plugin icon in the brand colour without a logo', () => {
    const icon = vi.fn(() => <svg data-testid={PLUGIN_TEST_ID} />);
    renderWithTheme(<PluginIcon icon={icon} size="md" />);
    expect(screen.getByTestId(PLUGIN_TEST_ID)).toBeTruthy();
    expect(icon).toHaveBeenCalledWith({ color: light.colors.iconBrand });
  });

  it('colours a tint logo with its brand colour', () => {
    renderWithTheme(
      <PluginIcon
        icon={() => null}
        size="md"
        logo={{ kind: CONNECTOR_LOGO_KIND.TINT, color: TINT_COLOR, Svg: TestSvg }}
      />,
    );
    const wrapper = screen.getByTestId(LOGO_TEST_ID).parentElement as HTMLElement;
    expect(getComputedStyle(wrapper).color).toBe(colourOf(TINT_COLOR));
  });

  it('asks the plugin icon for the brand colour when a tint has no Svg', () => {
    const icon = vi.fn(() => <svg data-testid={PLUGIN_TEST_ID} />);
    renderWithTheme(<PluginIcon icon={icon} size="md" logo={{ kind: CONNECTOR_LOGO_KIND.TINT, color: TINT_COLOR }} />);
    expect(screen.getByTestId(PLUGIN_TEST_ID)).toBeTruthy();
    expect(icon).toHaveBeenCalledWith({ color: TINT_COLOR });
  });

  it('asks the plugin icon for the text colour when a mono has no Svg', () => {
    const icon = vi.fn(() => <svg data-testid={PLUGIN_TEST_ID} />);
    renderWithTheme(<PluginIcon icon={icon} size="md" logo={{ kind: CONNECTOR_LOGO_KIND.MONO }} />);
    expect(icon).toHaveBeenCalledWith({ color: light.colors.text });
  });
});
