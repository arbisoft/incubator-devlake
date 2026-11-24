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

export type EmailStatus = 'QUEUED' | 'SENT' | 'FAILED';

export type MailStatus = {
  enabled: boolean;
  driver: string;
  host?: string;
  port?: number;
  security?: string;
  auth?: string;
  fromAddress: string;
  fromName: string;
  disabledReason?: string;
};

export type TestEmailResult = {
  id: number;
  status: EmailStatus;
};

export type EmailHistoryItem = {
  id: number;
  sender: string;
  recipients: string[];
  subject: string;
  status: EmailStatus;
  sentOn: string | null;
  sentBy: string;
  template: string;
  projectName: string | null;
  source: string | null;
  sourceId: string | null;
  provider: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  attempts: number;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmailHistoryDetail = EmailHistoryItem & {
  content: string;
  textContent: string;
};
