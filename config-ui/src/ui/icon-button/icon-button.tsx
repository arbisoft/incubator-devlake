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

import { Tooltip } from 'antd';

import { ICON_BUTTON_TONE } from './constants';
import { ToneButton } from './styled';
import type { IconButtonProps } from './types';

const TOOLTIP_TRIGGERS: ('hover' | 'focus')[] = ['hover', 'focus'];

export const IconButton = ({
  icon,
  label,
  tone = ICON_BUTTON_TONE.DEFAULT,
  disabled,
  disabledReason,
  loading,
  buttonRef,
  onClick,
}: IconButtonProps) => {
  const blocked = disabledReason !== undefined;
  return (
    <Tooltip title={disabledReason ?? label} trigger={TOOLTIP_TRIGGERS}>
      <ToneButton
        type="text"
        danger={tone === ICON_BUTTON_TONE.DANGER}
        $brand={tone === ICON_BUTTON_TONE.PRIMARY}
        $blocked={blocked}
        icon={icon}
        aria-label={label}
        aria-disabled={blocked || undefined}
        ref={buttonRef}
        disabled={disabled}
        loading={loading}
        onClick={blocked ? undefined : onClick}
      />
    </Tooltip>
  );
};
