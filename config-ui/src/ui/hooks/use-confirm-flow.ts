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

import { useCallback, useState } from 'react';

import { CONFIRM_TONE, type ConfirmModalProps } from '@/ui/confirm-modal';
import type { ConfirmConfig } from '@/ui/types';

type Options<P> = {
  resolve: (pending: P) => { config?: ConfirmConfig; name: string };
  run: (pending: P, setLoading: (loading: boolean) => void) => Promise<boolean>;
};

export const useConfirmFlow = <P>({ resolve, run }: Options<P>) => {
  const [pending, setPending] = useState<P>();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const request = useCallback(
    (next: P) => {
      if (resolve(next).config) {
        setPending(next);
        setOpen(true);
        return;
      }
      void run(next, setLoading);
    },
    [resolve, run],
  );

  const current = pending === undefined ? undefined : resolve(pending);
  const { config, name = '' } = current ?? {};

  const confirmProps: ConfirmModalProps = {
    open,
    tone: config?.tone ?? CONFIRM_TONE.DEFAULT,
    title: config?.title(name) ?? '',
    description: config?.description(name) ?? '',
    confirmLabel: config?.confirm ?? '',
    loading,
    onConfirm: async () => {
      if (pending !== undefined && (await run(pending, setLoading))) setOpen(false);
    },
    onCancel: () => setOpen(false),
  };

  return { request, confirmProps };
};
