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
import { useParams } from 'react-router-dom';

import { PATHS } from '@/config';
import { ListPage, PageHeader } from '@/ui';
import { useDocumentTitle } from '@/ui/hooks';

import { PipelinePanel } from './components';
import { COPY } from './constants';

export const Pipeline = () => {
  const { id } = useParams();

  useDocumentTitle(COPY.detailTitle(id as string));

  return (
    <ListPage>
      <PageHeader
        title={COPY.detailTitle(id as string)}
        breadcrumbs={[
          { label: COPY.breadcrumbAdvanced, path: PATHS.BLUEPRINTS() },
          { label: COPY.title, path: PATHS.PIPELINES() },
          { label: id as string },
        ]}
      />
      <PipelinePanel id={id as string} />
    </ListPage>
  );
};
