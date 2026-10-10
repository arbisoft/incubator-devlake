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

import { LINKS } from '@/config';
import { CODE_LANGUAGE, CodeBlock, ExternalLink } from '@/ui';

import { COMMAND_KEY, COPY } from '../constants';
import { Command, CommandLabel, Group, GroupTitle, Hint } from '../styled';
import type { WebhookCommands as Commands } from '../types';

const SECTIONS = [
  {
    title: COPY.commands.titles.incident,
    items: [
      { key: COMMAND_KEY.POST_ISSUES, docs: LINKS.WEBHOOK_SCHEMA.INCIDENT },
      { key: COMMAND_KEY.CLOSE_ISSUES, docs: LINKS.WEBHOOK_SCHEMA.INCIDENT_CLOSE },
    ],
  },
  {
    title: COPY.commands.titles.deployments,
    items: [{ key: COMMAND_KEY.POST_DEPLOYMENTS, docs: LINKS.WEBHOOK_SCHEMA.DEPLOYMENT }],
  },
  {
    title: COPY.commands.titles.pullRequests,
    items: [{ key: COMMAND_KEY.POST_PULL_REQUESTS, docs: LINKS.WEBHOOK_SCHEMA.PULL_REQUEST }],
  },
];

type WebhookCommandsProps = {
  commands: Commands;
};

export const WebhookCommands = ({ commands }: WebhookCommandsProps) => (
  <>
    {SECTIONS.map(({ title, items }) => (
      <Group key={title}>
        <GroupTitle>{title}</GroupTitle>
        {items.map(({ key, docs }) => (
          <Command key={key}>
            <CommandLabel>{COPY.commands.labels[key]}</CommandLabel>
            <CodeBlock
              value={commands[key]}
              language={CODE_LANGUAGE.SHELL}
              copyLabel={COPY.commands.copyFor(COPY.commands.labels[key])}
              singleLine
            />
            <Hint>
              {COPY.commands.seeThe} <ExternalLink href={docs}>{COPY.commands.schema}</ExternalLink>.
            </Hint>
          </Command>
        ))}
      </Group>
    ))}
  </>
);
