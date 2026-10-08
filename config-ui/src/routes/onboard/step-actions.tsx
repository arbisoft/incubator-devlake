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

import { COPY } from './constants';
import * as S from './styled';

type StepActionsProps = {
  loading: boolean;
  nextDisabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export const StepActions = ({ loading, nextDisabled, onPrevious, onNext }: StepActionsProps) => (
  <S.Actions>
    <Button ghost type="primary" loading={loading} onClick={onPrevious}>
      {COPY.previous}
    </Button>
    <Button type="primary" loading={loading} disabled={nextDisabled} onClick={onNext}>
      {COPY.next}
    </Button>
  </S.Actions>
);
