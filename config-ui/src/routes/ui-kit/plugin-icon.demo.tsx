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

import { getPluginConfig } from '@/plugins';
import { ICON_SIZE_PX, PluginIcon, type IconSize } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { PLUGIN_KEYS, UNKNOWN_PLUGIN_KEY } from './fixtures';
import { Row } from './styled';

const SIZES = Object.keys(ICON_SIZE_PX) as IconSize[];

export const PluginIconDemo = () => (
  <DemoSection id={SECTION.PLUGIN_ICON} title={COPY.sections.pluginIcon}>
    {SIZES.map((size) => (
      <DemoCase key={size} label={`${COPY.cases.sizes}: ${size}`}>
        <Row>
          {PLUGIN_KEYS.map((plugin) => (
            <PluginIcon key={plugin} icon={getPluginConfig(plugin).icon} size={size} />
          ))}
        </Row>
      </DemoCase>
    ))}
    <DemoCase label={COPY.cases.fallback}>
      <PluginIcon icon={getPluginConfig(UNKNOWN_PLUGIN_KEY).icon} size="lg" />
    </DemoCase>
  </DemoSection>
);
