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

import { LockOutlined } from '@ant-design/icons';
import { Alert } from 'antd';
import { useMemo } from 'react';

import { LINKS } from '@/config/links';
import { CODE_LANGUAGE, CodeBlock, ExternalLink, FormModal, KeyValueList, MODAL_WIDTH } from '@/ui';

import { Hint, Stack } from '../styled';
import type { SnippetModalProps } from '../types';
import { getOtelApplyError } from '../utils';

import { COPY } from './constants';

export const SnippetModal = ({ open, credential, onClose, onClosed }: SnippetModalProps) => {
  const summary = useMemo(
    () =>
      credential
        ? [
            { label: COPY.snippet.team, value: credential.connection.teamName },
            { label: COPY.snippet.teamSlug, value: credential.connection.teamSlug },
            { label: COPY.snippet.endpoint, value: credential.connection.collectorEndpoint },
          ]
        : [],
    [credential],
  );

  return (
    <FormModal
      open={open}
      width={MODAL_WIDTH.LG}
      icon={<LockOutlined aria-hidden />}
      title={COPY.snippet.title}
      submitLabel={COPY.snippet.done}
      showCancel={false}
      onSubmit={onClose}
      onCancel={onClose}
      afterClose={onClosed}
    >
      <Stack>
        <Alert type="warning" showIcon title={COPY.snippet.storageNotice} />
        <Hint>{COPY.snippet.replaceNotice}</Hint>
        <KeyValueList items={summary} />
        <CodeBlock value={credential?.managedSettings} language={CODE_LANGUAGE.JSON} copyLabel={COPY.snippet.copy} />
        <Hint>
          {COPY.snippet.addIn}{' '}
          <ExternalLink href={LINKS.CLAUDE_CODE_MANAGED_SETTINGS}>{COPY.snippet.linkLabel}</ExternalLink>.
        </Hint>
        {credential?.restartRequired && <Alert type="warning" showIcon title={getOtelApplyError(credential)} />}
      </Stack>
    </FormModal>
  );
};
