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

import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useInView } from './use-in-view';

type Callback = (entries: { isIntersecting: boolean }[]) => void;

let callback: Callback = (_entries) => undefined;
const disconnect = vi.fn();

class FakeObserver {
  constructor(cb: Callback) {
    callback = cb;
  }
  observe = vi.fn();
  disconnect = disconnect;
}

const Probe = ({ once }: { once?: boolean }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once });
  return <div ref={ref}>{inView ? 'visible' : 'hidden'}</div>;
};

describe('useInView', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    disconnect.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('follows the intersection state', () => {
    render(<Probe />);
    expect(screen.getByText('hidden')).toBeTruthy();
    act(() => callback([{ isIntersecting: true }]));
    expect(screen.getByText('visible')).toBeTruthy();
    act(() => callback([{ isIntersecting: false }]));
    expect(screen.getByText('hidden')).toBeTruthy();
  });

  it('stays true and disconnects after the first intersection with once', () => {
    render(<Probe once />);
    act(() => callback([{ isIntersecting: true }]));
    expect(disconnect).toHaveBeenCalled();
    act(() => callback([{ isIntersecting: false }]));
    expect(screen.getByText('visible')).toBeTruthy();
  });

  it('reports in view when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Probe />);
    expect(screen.getByText('visible')).toBeTruthy();
  });
});
