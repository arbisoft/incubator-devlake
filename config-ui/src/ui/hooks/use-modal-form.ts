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

import { useCallback, useRef, useState } from 'react';

import { operator, type OperateConfig } from '@/utils';

type ModalFormOptions<T> = {
  onClose: () => void;
  required: (keyof T)[];
  disabledReason: string;
  onSettled?: () => void;
};

type ModalSubmitOptions<R> = Pick<OperateConfig, 'formatMessage' | 'formatReason' | 'hideToast'> & {
  onSuccess?: (result: R) => void;
};

export const useModalForm = <T extends object>(
  initial: T,
  { onClose, required, disabledReason, onSettled }: ModalFormOptions<T>,
) => {
  const initialValues = useRef(initial);
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);

  const setField = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => setValues((current) => ({ ...current, [key]: value })),
    [],
  );
  const reset = useCallback(() => setValues(initialValues.current), []);
  const cancel = useCallback(() => {
    setValues(initialValues.current);
    onClose();
  }, [onClose]);
  const submit = useCallback(
    async <R>(
      request: () => Promise<R>,
      { onSuccess, ...config }: ModalSubmitOptions<R> = {},
    ): Promise<[boolean, unknown]> => {
      const [success, result] = await operator(request, { ...config, setOperating: setSaving });
      onSettled?.();
      if (success) {
        onSuccess?.(result as R);
        setValues(initialValues.current);
        onClose();
      }
      return [success, result];
    },
    [onClose, onSettled],
  );

  return {
    values,
    setField,
    reset,
    submit,
    setSaving,
    modalProps: {
      loading: saving,
      submitDisabled: required.some((key) => !values[key]),
      disabledReason,
      onCancel: cancel,
    },
  };
};
