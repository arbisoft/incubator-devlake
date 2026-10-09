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

import { message } from 'antd';
import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import API from '@/api';
import { PATHS } from '@/config';
import { useRefreshData } from '@/hooks';
import type { IBlueprint, IPipeline } from '@/types';
import { useConfirmFlow, useLastLoaded, useRefreshVersion, useRouteTab } from '@/ui/hooks';
import type { RouteTab } from '@/ui/types';
import { toUserMessage } from '@/ui/utils';
import { operator } from '@/utils';

import { CONFIRM, CONFIRM_KIND, COPY, HISTORY_PAGE_SIZE, RUN_ERROR_MAP } from './constants';
import type { ConfirmKind, RunPolicy } from './types';
import { toBlueprintView } from './utils';

export const useBlueprintView = (views: RouteTab[]) => toBlueprintView(useRouteTab(views));

export const useBlueprintDetail = (blueprintId: ID) => {
  const navigate = useNavigate();
  const { version, refresh } = useRefreshVersion();

  const { data, error } = useRefreshData(
    async (signal) => {
      const [blueprint, pipelines] = await Promise.all([
        API.blueprint.get(blueprintId, signal),
        API.blueprint.pipelines(blueprintId, undefined, signal),
      ]);
      return { blueprint: blueprint as IBlueprint, latestPipelineId: pipelines.pipelines[0]?.id as ID | undefined };
    },
    [blueprintId, version],
  );
  const detail = useLastLoaded(data, blueprintId);

  useEffect(() => {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      message.error(COPY.notFound(blueprintId));
      navigate(PATHS.BLUEPRINTS(), { replace: true });
    }
  }, [error, navigate, blueprintId]);

  return { detail, version, refresh };
};

export const useBlueprintPipelines = (blueprintId: ID, version: number) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(HISTORY_PAGE_SIZE);

  const { data, ready } = useRefreshData(
    (signal) => API.blueprint.pipelines(blueprintId, { page, pageSize }, signal),
    [blueprintId, page, pageSize, version],
  );
  const history = useLastLoaded(data, blueprintId);

  const pagination = {
    page,
    pageSize,
    total: history?.count ?? 0,
    onPageChange: setPage,
    onPageSizeChange: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
  };

  return { pipelines: (history?.pipelines ?? []) as IPipeline[], loading: !ready, pagination };
};

type ActionsOptions = { blueprint: IBlueprint; onRefresh: () => void };

export const useBlueprintActions = ({ blueprint, onRefresh }: ActionsOptions) => {
  const navigate = useNavigate();
  const [operating, setOperating] = useState(false);
  const { id, name } = blueprint;

  const trigger = useCallback(
    async (policy: RunPolicy = {}, setLoading: (loading: boolean) => void = setOperating) => {
      const [success] = await operator(
        () => API.blueprint.trigger(id, { skipCollectors: false, fullSync: false, ...policy }),
        {
          setOperating: setLoading,
          formatMessage: () => COPY.messages.triggered,
          formatReason: (error) => toUserMessage(error, RUN_ERROR_MAP, COPY.errors.run),
        },
      );
      if (success) onRefresh();
      return success;
    },
    [id, onRefresh],
  );

  const setEnabled = async (enable: boolean) => {
    const [success] = await operator(() => API.blueprint.update(id, { ...blueprint, enable }), {
      setOperating,
      formatMessage: () => COPY.messages.updated,
      formatReason: (error) => toUserMessage(error, {}, COPY.errors.update),
    });
    if (success) onRefresh();
  };

  const remove = useCallback(
    async (setLoading: (loading: boolean) => void) => {
      const [success] = await operator(() => API.blueprint.remove(id), {
        setOperating: setLoading,
        formatMessage: () => COPY.messages.deleted,
        formatReason: (error) => toUserMessage(error, {}, COPY.errors.remove),
      });
      if (success) navigate(PATHS.BLUEPRINTS());
      return success;
    },
    [id, navigate],
  );

  const resolve = useCallback((kind: ConfirmKind) => ({ config: CONFIRM[kind], name }), [name]);
  const confirmRun = useCallback(
    (kind: ConfirmKind, setLoading: (loading: boolean) => void) =>
      kind === CONFIRM_KIND.DELETE ? remove(setLoading) : trigger({ fullSync: true }, setLoading),
    [remove, trigger],
  );
  const { request, confirmProps } = useConfirmFlow<ConfirmKind>({ resolve, run: confirmRun });

  return { operating, trigger, setEnabled, requestConfirm: request, confirmProps };
};
