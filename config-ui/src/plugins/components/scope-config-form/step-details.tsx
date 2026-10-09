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

import { Input, Select } from 'antd';

import { Message } from '@/components';
import { LINKS } from '@/config/links';
import { ExternalLink, FormField } from '@/ui';

import { COPY, NAME_MAX_LENGTH } from './constants';
import { Fields, Notice } from './styled';
import type { StepDetailsProps } from './types';

export const StepDetails = ({
  name,
  entities,
  entityOptions,
  showWarning,
  onNameChange,
  onEntitiesChange,
}: StepDetailsProps) => (
  <Fields>
    <FormField label={COPY.name.label} description={COPY.name.description} required>
      {(control) => (
        <Input
          {...control}
          placeholder={COPY.name.placeholder}
          maxLength={NAME_MAX_LENGTH}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
      )}
    </FormField>
    <div>
      <FormField
        label={COPY.entities.label}
        description={
          <>
            {COPY.entities.description} <ExternalLink href={LINKS.DATA_ENTITIES}>{COPY.entities.link}</ExternalLink>
          </>
        }
        required
      >
        {(control) => (
          <Select {...control} mode="multiple" options={entityOptions} value={entities} onChange={onEntitiesChange} />
        )}
      </FormField>
      {showWarning && (
        <Notice>
          <Message content={COPY.entitiesWarning} />
        </Notice>
      )}
    </div>
  </Fields>
);
