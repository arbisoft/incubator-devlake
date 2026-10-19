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
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import API from '@/api';
import { PATHS } from '@/config';
import { EMPTY_ILLUSTRATION, EMPTY_STATE_SIZE, EmptyState, StandalonePage } from '@/ui';
import { useDocumentTitle } from '@/ui/hooks';
import { operator } from '@/utils';

import { COPY } from './constants';
import { Actions, Warning } from './styled';

export const DBMigrate = () => {
  useDocumentTitle(COPY.title);

  const [operating, setOperating] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async () => {
    const [success] = await operator(() => API.migrate(), {
      setOperating,
    });

    if (success) {
      navigate(PATHS.ROOT());
    }
  };

  return (
    <StandalonePage>
      <EmptyState
        illustration={EMPTY_ILLUSTRATION.EMPTY}
        title={COPY.heading}
        description={COPY.description}
        size={EMPTY_STATE_SIZE.PAGE}
        action={
          <Actions>
            <Warning>{COPY.warning}</Warning>
            <Button type="primary" loading={operating} onClick={handleSubmit}>
              {COPY.proceed}
            </Button>
          </Actions>
        }
      />
    </StandalonePage>
  );
};
