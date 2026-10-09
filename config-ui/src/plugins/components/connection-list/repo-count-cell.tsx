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

import { useEffect, useRef } from 'react';

import type { IConnection } from '@/types';
import { useInView } from '@/ui';

import { COPY } from './constants';

type RepoCountCellProps = {
  connection: IConnection;
  count?: number | null;
  onVisible: (connection: IConnection) => void;
};

export const RepoCountCell = ({ connection, count, onVisible }: RepoCountCellProps) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (inView) onVisible(connection);
  }, [inView, connection, onVisible]);

  return <span ref={ref}>{count ?? COPY.noRepoCount}</span>;
};
