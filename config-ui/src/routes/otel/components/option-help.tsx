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

import { storageFor } from '../managed-settings';
import { HelpDetails } from '../styled';
import type { OptionHelpProps, StorageEstimate } from '../types';

import { COPY, OPTION_COPY } from './constants';

const { storage, storageRawOnly, storageNone } = COPY.snippet.options;

const storageLine = ({ rawMb, monthlyMb }: StorageEstimate) => {
  if (rawMb === 0) return storageNone;
  if (monthlyMb === 0) return storageRawOnly(rawMb);
  return storage(rawMb, monthlyMb);
};

export const OptionHelp = ({ option }: OptionHelpProps) => {
  return (
    <HelpDetails>
      <ul>
        {OPTION_COPY[option].details.map((detail) => (
          <li key={detail}>{detail}</li>
        ))}
      </ul>
      <span>{storageLine(storageFor(option))}</span>
    </HelpDetails>
  );
};
