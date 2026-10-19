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
import { useEffect, useMemo, useState } from 'react';

import API from '@/api';
import { getPluginConfig } from '@/plugins/utils';
import { toUserMessage } from '@/ui/utils';
import { operator } from '@/utils';

import { COPY, SAVE_ERROR_MAP, SCOPE_CONFIG_STEP } from './constants';
import type { ScopeConfigFormProps, Transformation } from './types';
import { toCopyName, toTransformation } from './utils';

type Options = Pick<
  ScopeConfigFormProps,
  'plugin' | 'connectionId' | 'defaultName' | 'forceCreate' | 'scopeConfigId'
> & {
  onSubmit: ScopeConfigFormProps['onSubmit'];
};

export const useScopeConfigForm = ({
  plugin,
  connectionId,
  defaultName,
  forceCreate = false,
  scopeConfigId,
  onSubmit,
}: Options) => {
  const config = useMemo(() => getPluginConfig(plugin), [plugin]);
  const [step, setStep] = useState<number>(SCOPE_CONFIG_STEP.DETAILS);
  const [name, setName] = useState(defaultName ?? '');
  const [entities, setEntities] = useState<string[]>(config.scopeConfig?.entities ?? []);
  const [transformation, setTransformation] = useState<Transformation>(config.scopeConfig?.transformation ?? {});
  const [hasError, setHasError] = useState(false);
  const [operating, setOperating] = useState(false);

  useEffect(() => {
    if (!scopeConfigId) return undefined;
    let stale = false;

    (async () => {
      try {
        const res = await API.scopeConfig.get(plugin, connectionId, scopeConfigId);
        if (stale) return;
        setName(toCopyName(res.name, forceCreate));
        setEntities(res.entities ?? []);
        setTransformation(toTransformation(res));
      } catch (err) {
        if (!stale) message.error(toUserMessage(err, {}, COPY.loadFailed));
      }
    })();

    return () => {
      stale = true;
    };
  }, [plugin, connectionId, scopeConfigId, forceCreate]);

  const submit = async () => {
    const payload = { name, entities, ...transformation };
    const [success, res] = await operator(
      () =>
        !scopeConfigId || forceCreate
          ? API.scopeConfig.create(plugin, connectionId, payload)
          : API.scopeConfig.update(plugin, connectionId, scopeConfigId, payload),
      {
        setOperating,
        hideToast: true,
      },
    );

    if (success) {
      onSubmit(res.id);
    } else {
      message.error(toUserMessage(res, SAVE_ERROR_MAP, COPY.saveFailed));
    }
  };

  return {
    config,
    step,
    name,
    entities,
    transformation,
    hasError,
    operating,
    setName,
    setEntities,
    setTransformation,
    setHasError,
    toDetails: () => setStep(SCOPE_CONFIG_STEP.DETAILS),
    toTransformations: () => setStep(SCOPE_CONFIG_STEP.TRANSFORMATIONS),
    submit,
  };
};
