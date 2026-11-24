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

import { Alert, Button } from 'antd';

import API from '@/api';
import { useRefreshData } from '@/hooks';
import { DetailDrawer, KeyValueList, StatusBadge } from '@/ui';
import { formatTime } from '@/utils';

import { COPY, DATE_FORMAT, PREVIEW_SANDBOX } from '../constants';
import { Content, PlainText, PreviewFrame, SectionLabel } from '../styled';
import type { EmailDrawerProps, EmailHistoryDetail } from '../types';
import { getStatusLabel, getStatusTone, getTemplateLabel } from '../utils';

const time = (value: string | null) => (value ? formatTime(value, DATE_FORMAT) : '-');

const fields = (email: EmailHistoryDetail) => {
  const f = COPY.drawer.fields;
  return [
    { label: f.subject, value: email.subject },
    { label: f.from, value: email.sender },
    { label: f.recipients, value: email.recipients.join(', ') },
    { label: f.template, value: getTemplateLabel(email.template) },
    { label: f.project, value: email.projectName ?? '-' },
    { label: f.source, value: email.source ? [email.source, email.sourceId].filter(Boolean).join(' / ') : '-' },
    { label: f.sentBy, value: email.sentBy },
    { label: f.created, value: time(email.createdAt) },
    { label: f.sentOn, value: time(email.sentOn) },
    { label: f.attempts, value: String(email.attempts) },
    { label: f.nextAttempt, value: time(email.nextAttemptAt) },
    { label: f.provider, value: email.provider },
    { label: f.messageId, value: email.providerMessageId ?? '-' },
  ];
};

export const EmailDrawer = ({ open, emailId, onClose }: EmailDrawerProps) => {
  const { data: email, error } = useRefreshData(
    async (signal) => (emailId ? API.mail.historyEmail(emailId, signal) : undefined),
    [emailId],
  );

  return (
    <DetailDrawer
      open={open}
      title={COPY.drawer.title}
      status={
        email && <StatusBadge tone={getStatusTone(email.status)} label={getStatusLabel(email.status)} variant="dot" />
      }
      onClose={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          {COPY.drawer.close}
        </Button>
      }
    >
      {error !== undefined && <Alert type="error" showIcon title={COPY.drawer.loadFailed} />}
      {email && (
        <Content>
          {email.errorMessage && (
            <Alert
              type={email.status === 'FAILED' ? 'error' : 'warning'}
              showIcon
              title={COPY.drawer.error}
              description={email.errorMessage}
            />
          )}
          <KeyValueList items={fields(email)} />
          <section>
            <SectionLabel>{COPY.drawer.preview}</SectionLabel>
            <PreviewFrame
              sandbox={PREVIEW_SANDBOX}
              srcDoc={email.content}
              title={COPY.drawer.previewTitle(email.subject)}
            />
          </section>
          <section>
            <SectionLabel>{COPY.drawer.plainText}</SectionLabel>
            <PlainText>{email.textContent}</PlainText>
          </section>
        </Content>
      )}
    </DetailDrawer>
  );
};
