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

import { Space } from 'antd';

import { ILLUSTRATIONS } from './illustrations';
import { Copy, Description, Title, Wrapper } from './styled';
import type { EmptyStateProps } from './types';

export const EmptyState = ({ illustration, title, description, action, size }: EmptyStateProps) => {
  const Illustration = illustration && ILLUSTRATIONS[illustration];
  return (
    <Wrapper $size={size}>
      {Illustration && <Illustration aria-hidden focusable={false} />}
      <Copy>
        <Title>{title}</Title>
        {description && <Description>{description}</Description>}
      </Copy>
      {action && <Space wrap>{action}</Space>}
    </Wrapper>
  );
};
