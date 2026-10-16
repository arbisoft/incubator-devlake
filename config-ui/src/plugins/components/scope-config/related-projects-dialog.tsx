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

import { Message } from '@/components';

import { ConnectionModal } from '../connection-modal';

import { COPY } from './constants';
import { Actions, Body, ProjectItem, ProjectList } from './styled';
import type { RelatedProjectsDialogProps } from './types';

export const RelatedProjectsDialog = ({
  open,
  plugin,
  title,
  scopeName,
  projects,
  onCancel,
  onContinue,
  onDuplicate,
}: RelatedProjectsDialogProps) => (
  <ConnectionModal open={open} plugin={plugin} title={title} onCancel={onCancel}>
    <Body>
      <Message content={COPY.related.notice} />
      <ProjectList>
        {projects.map((it) => (
          <ProjectItem key={it.name}>
            {it.name}: {it.scopes.map((sc) => sc.scopeName).join(',')}
          </ProjectItem>
        ))}
      </ProjectList>
      <Actions>
        <Button type="primary" onClick={onContinue}>
          {COPY.related.continue}
        </Button>
        <Button type="primary" onClick={onDuplicate}>
          {COPY.related.duplicate(scopeName)}
        </Button>
        <Button onClick={onCancel}>{COPY.related.cancel}</Button>
      </Actions>
    </Body>
  </ConnectionModal>
);
