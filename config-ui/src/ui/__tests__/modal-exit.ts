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

import { fireEvent, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

export const finishModalExit = async (modal?: HTMLElement | null, timeoutMessage?: string) => {
  const dialog = modal ?? document.querySelector<HTMLElement>('.ant-modal');
  if (!dialog) throw new Error('Expected an open antd modal.');
  await waitFor(
    () => expect(dialog.classList.contains('ant-zoom-leave-active')).toBe(true),
    timeoutMessage ? { onTimeout: () => new Error(timeoutMessage) } : undefined,
  );
  fireEvent.transitionEnd(dialog);
};
