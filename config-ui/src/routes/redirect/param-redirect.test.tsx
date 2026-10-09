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

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ParamRedirect } from './param-redirect';

const Location = () => {
  const { pathname, search, hash } = useLocation();
  return <span data-testid="location">{`${pathname}${search}${hash}`}</span>;
};

const setup = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/old/:id" element={<ParamRedirect to={({ id }) => `/new/${id}`} />} />
        <Route path="/new/:id" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ParamRedirect', () => {
  it('redirects to the target built from the route params', () => {
    setup('/old/42');
    expect(screen.getByTestId('location').textContent).toBe('/new/42');
  });

  it('keeps the query string and the hash', () => {
    setup('/old/42?a=1&b=two#frag');
    expect(screen.getByTestId('location').textContent).toBe('/new/42?a=1&b=two#frag');
  });
});
