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

import { Breadcrumb } from 'antd';
import { Link } from 'react-router-dom';

import { useDocumentTitle } from '@/ui/hooks';

import { COPY } from './constants';
import { Actions, Description, Heading, Root, Title, TitleRow } from './styled';
import type { PageHeaderProps } from './types';

export const PageHeader = ({
  title,
  showTitle = true,
  description,
  breadcrumbs,
  status,
  switcher,
  actions,
}: PageHeaderProps) => {
  useDocumentTitle(title);

  return (
    <Root>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb
          aria-label={COPY.breadcrumb}
          items={breadcrumbs.map(({ label, path }) => ({ title: path ? <Link to={path}>{label}</Link> : label }))}
        />
      )}
      {(showTitle || status || switcher || actions) && (
        <Heading>
          <TitleRow>
            {showTitle && <Title>{title}</Title>}
            {status}
            {switcher}
          </TitleRow>
          {actions && <Actions>{actions}</Actions>}
        </Heading>
      )}
      {description && <Description>{description}</Description>}
    </Root>
  );
};
