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

import type { AccessRole } from '@/api/access';

export type FormNoteProps = { children: string };

export type TextFieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
  onChange: (value: string) => void;
};

export type LoginNameFieldProps = { value: string; onChange: (value: string) => void };

export type RoleFieldProps = {
  label: string;
  value: AccessRole;
  onChange: (role: AccessRole) => void;
};

export type AccessFormModalProps<T extends object> = {
  open: boolean;
  onClose: () => void;
  copy: { title: string; submit: string; disabledReason: string; note: string; role?: { label: string } };
  icon: ReactNode;
  initial: T;
  required: (keyof T)[];
  isValid: (values: T) => boolean;
  submit: (values: T, setSaving: (saving: boolean) => void) => Promise<boolean>;
  children: (values: T, setField: <K extends keyof T>(key: K, value: T[K]) => void) => ReactNode;
};
