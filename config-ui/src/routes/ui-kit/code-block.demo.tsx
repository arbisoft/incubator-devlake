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

import { CODE_LANGUAGE, CodeBlock } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { JSON_LONG_SAMPLE, JSON_SAMPLE, SHELL_SAMPLE } from './fixtures';

const MAX_HEIGHT = 160;

export const CodeBlockDemo = () => (
  <DemoSection id={SECTION.CODE_BLOCK} title={COPY.sections.codeBlock}>
    <DemoCase label={COPY.cases.default}>
      <CodeBlock value={JSON_SAMPLE} language={CODE_LANGUAGE.JSON} copyLabel={COPY.codeBlock.copy} />
    </DemoCase>
    <DemoCase label={COPY.cases.scrollable}>
      <CodeBlock
        value={JSON.stringify(JSON_LONG_SAMPLE)}
        language={CODE_LANGUAGE.JSON}
        copyLabel={COPY.codeBlock.copy}
        maxHeight={MAX_HEIGHT}
      />
    </DemoCase>
    <DemoCase label={COPY.cases.notJson}>
      <CodeBlock value={COPY.codeBlock.plain} language={CODE_LANGUAGE.JSON} copyLabel={COPY.codeBlock.copy} />
    </DemoCase>
    <DemoCase label={COPY.cases.shell}>
      <CodeBlock value={SHELL_SAMPLE} language={CODE_LANGUAGE.SHELL} copyLabel={COPY.codeBlock.copyCommand} />
    </DemoCase>
    <DemoCase label={COPY.cases.singleLine}>
      <CodeBlock
        value={SHELL_SAMPLE}
        language={CODE_LANGUAGE.SHELL}
        copyLabel={COPY.codeBlock.copyCommand}
        singleLine
      />
    </DemoCase>
    <DemoCase label={COPY.cases.empty}>
      <CodeBlock value={undefined} language={CODE_LANGUAGE.JSON} copyLabel={COPY.codeBlock.copy} />
    </DemoCase>
  </DemoSection>
);
