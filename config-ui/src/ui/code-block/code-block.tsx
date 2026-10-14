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

import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';

import { COPIED_RESET_MS, COPY } from './constants';
import { CopyButtonSlot, FullText, Pre, Wrapper } from './styled';
import type { CodeBlockProps } from './types';
import { formatCode } from './utils';

export const CodeBlock = ({ value, copyLabel, maxHeight, singleLine }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const text = useMemo(() => formatCode(value), [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  return (
    <Wrapper>
      <Tooltip title={singleLine ? <FullText>{text}</FullText> : undefined}>
        <Pre tabIndex={0} aria-label={COPY.region} $maxHeight={maxHeight} $singleLine={singleLine}>
          <code>{text}</code>
        </Pre>
      </Tooltip>
      <CopyButtonSlot>
        <Tooltip title={copyLabel}>
          <Button aria-label={copyLabel} icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={copy} />
        </Tooltip>
      </CopyButtonSlot>
    </Wrapper>
  );
};
