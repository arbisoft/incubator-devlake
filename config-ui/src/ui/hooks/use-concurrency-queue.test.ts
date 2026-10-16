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

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useConcurrencyQueue } from './use-concurrency-queue';

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe('useConcurrencyQueue', () => {
  it('runs at most `limit` jobs at once and starts the next as one finishes', async () => {
    const { result } = renderHook(() => useConcurrencyQueue(2));
    const jobs = ['a', 'b', 'c'].map((key) => ({ key, ...deferred(), started: false }));
    jobs.forEach((job) =>
      result.current.enqueue(job.key, () => {
        job.started = true;
        return job.promise;
      }),
    );
    expect(jobs.map((job) => job.started)).toEqual([true, true, false]);
    await act(async () => jobs[0].resolve());
    expect(jobs[2].started).toBe(true);
  });

  it('deduplicates by key while a job is pending', async () => {
    const { result } = renderHook(() => useConcurrencyQueue(1));
    const first = deferred();
    let runs = 0;
    const job = () => {
      runs += 1;
      return first.promise;
    };
    const one = result.current.enqueue('row-1', job);
    const two = result.current.enqueue('row-1', job);
    expect(two).toBe(one);
    expect(runs).toBe(1);
    await act(async () => first.resolve());
    await one;
    result.current.enqueue('row-1', job);
    expect(runs).toBe(2);
  });

  it('keeps going after a job fails', async () => {
    const { result } = renderHook(() => useConcurrencyQueue(1));
    let secondRan = false;
    const failing = result.current.enqueue('bad', () => Promise.reject(new Error('nope')));
    const next = result.current.enqueue('good', async () => {
      secondRan = true;
    });
    await act(async () => {
      await Promise.all([failing, next]);
    });
    expect(secondRan).toBe(true);
  });
});
