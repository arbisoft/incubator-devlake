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

import type { ReactNode } from 'react';

export type ScopeConfigTransformation = Record<string, unknown>;

export type ConnectionFieldValues = Record<string, unknown>;
export type ConnectionFieldErrors = Record<string, unknown>;

export type ConnectionFieldRenderProps<V extends ConnectionFieldValues = ConnectionFieldValues> = {
  type: 'create' | 'update';
  connectionId?: ID;
  initialValues: V;
  values: V;
  errors: ConnectionFieldErrors;
  // intentional unchecked cast: method syntax lets each plugin declare its own value type
  setValues(values: Partial<V>): void;
  setErrors(errors: ConnectionFieldErrors): void;
};

// intentional unchecked cast: method syntax lets each plugin declare its own value type
type ConnectionFieldRenderer = { render(props: ConnectionFieldRenderProps): ReactNode }['render'];

export type ConnectionFieldOptions = {
  key: string;
  label?: ReactNode;
  subLabel?: ReactNode;
  placeholder?: string;
  defaultValue?: string | number;
  learnMore?: string;
  externalInfo?: string;
  multipleVersions?: Record<string, string>;
  disabled?: boolean;
  cloudName?: string;
  type?: string;
};

export type ConnectionField = string | ConnectionFieldOptions | ConnectionFieldRenderer;

export interface IPluginConfig {
  plugin: string;
  name: string;
  icon: ({ color }: { color: string }) => React.ReactNode;
  sort: number;
  isBeta?: boolean;
  isDeprecated?: boolean;
  deprecationMessage?: string;
  connection: {
    docLink: string;
    initialValues?: ConnectionFieldValues;
    fields: ConnectionField[];
    // when true, a successful Test Connection shows the message returned by
    // the plugin's test API (e.g. the authenticated login, soft warnings)
    // instead of the generic toast
    showTestResultMessage?: boolean;
  };
  dataScope: {
    localSearch?: boolean;
    searchPlaceholder?: string;
    title?: string;
    millerColumn?: {
      columnCount?: number;
      firstColumnTitle?: string;
    };
    render?: (props: any) => React.ReactNode;
  };
  scopeConfig?: {
    entities: string[];
    transformation: ScopeConfigTransformation;
  };
}
