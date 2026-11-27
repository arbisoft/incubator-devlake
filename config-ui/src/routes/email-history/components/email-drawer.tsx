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
import { useEffect, useState } from 'react';

import API from '@/api';
import { DetailDrawer, KeyValueList, StatusBadge } from '@/ui';
import { formatTime } from '@/utils';

import { COPY, DATE_FORMAT, EMAIL_STATUS, PREVIEW_SANDBOX, QUEUED_POLL_MS } from '../constants';
import { Content, PlainText, PreviewFrame, SectionLabel } from '../styled';
import type { EmailDrawerProps, EmailHistoryDetail } from '../types';
import { getStatusLabel, getStatusTone, getTemplateLabel } from '../utils';

const time = (value: string | null) => (value ? formatTime(value, DATE_FORMAT) : '-');

const fields = ({
  subject,
  sender,
  recipients,
  template,
  projectName,
  source,
  sourceId,
  sentBy,
  createdAt,
  sentOn,
  attempts,
  nextAttemptAt,
  provider,
  providerMessageId,
}: EmailHistoryDetail) => {
  const { fields: labels } = COPY.drawer;
  return [
    { label: labels.subject, value: subject },
    { label: labels.from, value: sender },
    { label: labels.recipients, value: recipients.join(', ') },
    { label: labels.template, value: getTemplateLabel(template) },
    { label: labels.project, value: projectName ?? '-' },
    { label: labels.source, value: source ? [source, sourceId].filter(Boolean).join(' / ') : '-' },
    { label: labels.sentBy, value: sentBy },
    { label: labels.created, value: time(createdAt) },
    { label: labels.sentOn, value: time(sentOn) },
    { label: labels.attempts, value: String(attempts) },
    { label: labels.nextAttempt, value: time(nextAttemptAt) },
    { label: labels.provider, value: provider },
    { label: labels.messageId, value: providerMessageId ?? '-' },
  ];
};

export const EmailDrawer = ({ open, emailId, onClose }: EmailDrawerProps) => {
  const [loaded, setLoaded] = useState<EmailHistoryDetail>();
  const [failure, setFailure] = useState<{ id: number; error: unknown }>();

  // Load the email each time the drawer opens, and check again while it is queued, so the drawer
  // never shows a stale status. The last copy stays on screen while a newer one loads.
  useEffect(() => {
    if (!open || !emailId) return;
    const controller = new AbortController();
    let timer: number | undefined;
    const load = () => {
      API.mail
        .historyEmail(emailId, controller.signal)
        .then((detail) => {
          if (controller.signal.aborted) return;
          setLoaded(detail);
          setFailure(undefined);
          if (detail.status === EMAIL_STATUS.QUEUED.value) timer = window.setTimeout(load, QUEUED_POLL_MS);
        })
        .catch((err: unknown) => {
          if (!controller.signal.aborted) setFailure({ id: emailId, error: err });
        });
    };
    load();
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, emailId]);

  // a copy of another email, or an error from one, is never shown for this one
  const email = loaded?.id === emailId ? loaded : undefined;
  const error = failure && failure.id === emailId ? failure.error : undefined;

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
              type={email.status === EMAIL_STATUS.FAILED.value ? 'error' : 'warning'}
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
