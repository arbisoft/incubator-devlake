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

import type { ReactNode, SetStateAction } from 'react';

import type { ScopeConfigTransformation } from '@/types';

export type Transformation = ScopeConfigTransformation;

export type ScopeConfigFormProps = {
  plugin: string;
  connectionId: ID;
  defaultName?: string;
  showWarning?: boolean;
  forceCreate?: boolean;
  scopeId?: ID;
  scopeConfigId?: ID;
  onCancel: () => void;
  onSubmit: (id: string) => void;
};

export type TransformationProps<T extends Transformation = Transformation> = {
  entities: string[];
  connectionId: ID;
  scopeId?: ID;
  scopeConfigId?: ID;
  transformation: T;
  // intentional unchecked cast: method syntax lets each plugin declare its own value type
  setTransformation(next: SetStateAction<T>): void;
  setHasError(hasError: boolean): void;
};

// intentional unchecked cast: method syntax lets each plugin declare its own value type
export type TransformationComponent = { render(props: TransformationProps): ReactNode }['render'];

export type StepDetailsProps = {
  name: string;
  entities: string[];
  entityOptions: { label: string; value: string }[];
  showWarning: boolean;
  onNameChange: (name: string) => void;
  onEntitiesChange: (entities: string[]) => void;
};
