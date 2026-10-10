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

import { ConnectionModal } from '../connection-modal';

import { COPY } from './constants';
import { Actions, Body, ProjectItem, ProjectList, ProjectRow } from './styled';
import type { SavedDialogProps } from './types';

export const SavedDialog = ({ plugin, projects, operating, onRun, onClose }: SavedDialogProps) => {
  const single = projects.length === 1;

  return (
    <ConnectionModal open={projects.length > 0} plugin={plugin} title={COPY.saved.title} onCancel={onClose}>
      <Body>
        <p>{single ? COPY.saved.single : COPY.saved.multiple}</p>
        {single ? (
          <Actions>
            <Button type="primary" loading={operating} onClick={() => onRun(projects[0])}>
              {COPY.saved.singleAction}
            </Button>
          </Actions>
        ) : (
          <ProjectList>
            {projects.map((project) => (
              <ProjectItem key={project.name}>
                <ProjectRow>
                  <span>{project.name}</span>
                  <Button size="small" type="link" loading={operating} onClick={() => onRun(project)}>
                    {COPY.saved.multipleAction}
                  </Button>
                </ProjectRow>
              </ProjectItem>
            ))}
          </ProjectList>
        )}
      </Body>
    </ConnectionModal>
  );
};
