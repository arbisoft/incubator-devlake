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

import { equal } from 'node:assert/strict';
import { test } from 'node:test';

import { formatPlural } from './text';

test('formats singular count correctly', () => {
  equal(formatPlural(1, 'credential'), '1 credential');
  equal(formatPlural(1, 'active credential'), '1 active credential');
  equal(formatPlural(1, 'connection'), '1 connection');
});

test('formats plural count correctly with default s suffix', () => {
  equal(formatPlural(0, 'credential'), '0 credentials');
  equal(formatPlural(2, 'active credential'), '2 active credentials');
  equal(formatPlural(5, 'connection'), '5 connections');
});

test('formats plural count correctly with explicit custom plural', () => {
  equal(formatPlural(1, 'person', 'people'), '1 person');
  equal(formatPlural(2, 'person', 'people'), '2 people');
  equal(formatPlural(0, 'person', 'people'), '0 people');
});
