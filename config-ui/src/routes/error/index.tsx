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

import { Button } from 'antd';
import { useRouteError, useNavigate } from 'react-router-dom';

import { LINKS, PATHS } from '@/config';
import { EMPTY_ILLUSTRATION, EMPTY_STATE_SIZE, EmptyState, StandalonePage } from '@/ui';
import { useDocumentTitle } from '@/ui/hooks';

import { COPY } from './constants';

export const ErrorPage = () => {
  useDocumentTitle(COPY.title);

  const error = useRouteError();

  const navigate = useNavigate();

  return (
    <StandalonePage>
      <EmptyState
        illustration={EMPTY_ILLUSTRATION.ERROR}
        title={String(error ?? '') || COPY.unknown}
        description={COPY.description}
        size={EMPTY_STATE_SIZE.PAGE}
        action={
          <>
            <Button type="primary" onClick={() => navigate(PATHS.ROOT())}>
              {COPY.continue}
            </Button>
            <Button href={LINKS.GITHUB} target="_blank" rel="noopener noreferrer">
              {COPY.github}
            </Button>
          </>
        }
      />
    </StandalonePage>
  );
};
