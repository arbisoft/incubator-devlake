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

import { CheckOutlined, CloseOutlined, QuestionOutlined } from '@ant-design/icons';

import { COPY, SIGNAL_STATE } from './constants';
import { IconBox } from './styled';
import type { SignalStatusIconProps } from './types';

const ICONS = {
  [SIGNAL_STATE.AVAILABLE]: CheckOutlined,
  [SIGNAL_STATE.MISSING]: CloseOutlined,
  [SIGNAL_STATE.UNKNOWN]: QuestionOutlined,
};

export const SignalStatusIcon = ({ state, large = false }: SignalStatusIconProps) => {
  const Icon = ICONS[state];
  return (
    <IconBox role="img" aria-label={COPY.state[state]} $state={state} $large={large}>
      <Icon aria-hidden />
    </IconBox>
  );
};
