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

import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { useDebounce } from 'ahooks';
import { Input, Button } from 'antd';
import axios from 'axios';
import { useEffect, useState } from 'react';

import API from '@/api';
import type { TransformationProps } from '@/plugins/components/scope-config-form/types';
import { operator } from '@/utils';

import type { JiraTransformationValues } from '../types';

import * as S from './styled';

let nextRowId = 0;
const newRowId = () => {
  nextRowId += 1;
  return `row-${nextRowId}`;
};

type Props = Pick<TransformationProps<JiraTransformationValues>, 'transformation' | 'setTransformation'>;

type Row = { id: string; pattern: string; regex: string };

export const RemoteLink = ({ transformation, setTransformation }: Props) => {
  const [focusedId, setFocusedId] = useState<string>();
  const [pattern, setPattern] = useState('');
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Row[]>(() =>
    (transformation.remotelinkRepoPattern ?? []).map((link) => ({ id: newRowId(), ...link })),
  );
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setTransformation({
      ...transformation,
      remotelinkRepoPattern: rows.filter((row) => row.regex).map(({ pattern, regex }) => ({ pattern, regex })),
    });
  }, [rows]);

  const debouncedPattern = useDebounce(pattern, { wait: 500 });

  const getRegex = async () => {
    const [success, res] = await operator(() => API.plugin.jira.generateRegex(pattern), {
      hideToast: true,
      setOperating: setGenerating,
    });

    if (success) {
      setRows(rows.map((row) => (row.id === focusedId ? { ...row, pattern, regex: res.regex } : row)));
    } else {
      setError(axios.isAxiosError<{ message?: string }>(res) ? (res.response?.data?.message ?? '') : '');
    }
  };

  useEffect(() => {
    if (debouncedPattern) {
      getRegex();
    }
  }, [debouncedPattern]);

  const handleAddLink = () => {
    setRows([...rows, { id: newRowId(), pattern: '', regex: '' }]);
  };

  const handleDeleteLink = (id: string) => {
    setRows(rows.filter((row) => row.id !== id));
  };

  return (
    <S.RemoteLinkWrapper>
      {rows.map((row) => (
        <div key={row.id} className="input">
          <div className="inner">
            <Input
              placeholder="E.g. https://gitlab.com/{namespace}/{repo_name}/-/commit/{commit_sha}"
              value={row.id === focusedId ? pattern : row.pattern}
              onChange={(e) => {
                setPattern(e.target.value);
                setError('');
              }}
              onFocus={() => {
                setFocusedId(row.id);
                setPattern(row.pattern);
                setError('');
              }}
            />
            {rows.length > 1 && (
              <Button
                type="primary"
                loading={generating}
                icon={<CloseOutlined />}
                onClick={() => handleDeleteLink(row.id)}
              />
            )}
          </div>
          {row.id === focusedId && error && <div className="error">{error}</div>}
        </div>
      ))}
      <Button type="primary" loading={generating} icon={<PlusOutlined />} onClick={() => handleAddLink()}>
        Add a Pattern
      </Button>
    </S.RemoteLinkWrapper>
  );
};
