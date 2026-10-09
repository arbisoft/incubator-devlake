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

import { CloseOutlined } from '@ant-design/icons';
import { useState } from 'react';

import { ConfirmModal, CONFIRM_TONE, IconButton } from '@/ui';

import { COPY } from '../constants';

type ExitControlProps = {
  onExit: () => Promise<boolean>;
};

export const ExitControl = ({ onExit }: ExitControlProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    const exited = await onExit();
    setLoading(false);
    if (exited) {
      setOpen(false);
    }
  };

  return (
    <>
      <IconButton icon={<CloseOutlined />} label={COPY.exit} onClick={() => setOpen(true)} />
      <ConfirmModal
        open={open}
        tone={CONFIRM_TONE.DEFAULT}
        title={COPY.exitConfirm.title}
        description={COPY.exitConfirm.description}
        confirmLabel={COPY.exitConfirm.confirm}
        loading={loading}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
};
