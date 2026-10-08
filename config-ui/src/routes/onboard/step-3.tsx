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

import { useState, useContext, useMemo } from 'react';

import API from '@/api';
import { DataScopeRemote, getPluginScopeName } from '@/plugins';
import type { ScopeItem } from '@/plugins/components/data-scope-remote/types';
import { operator } from '@/utils';

import { STORE_KEY } from './components/constants';
import { COPY, GUIDE_STEP, WIZARD_STEP } from './constants';
import { Context } from './context';
import { StepActions } from './step-actions';
import * as S from './styled';
import { useGuide } from './use-guide';
import { buildOnboardBlueprintUpdatePayload } from './utils';

export const Step3 = () => {
  const [operating, setOperating] = useState(false);
  const [scopes, setScopes] = useState<ScopeItem[]>([]);

  const { step, records, done, projectName, plugin, setStep, setRecords } = useContext(Context);

  const guide = useGuide(GUIDE_STEP.SCOPE, plugin);

  const connectionId = useMemo(() => {
    const record = records.find((it) => it.plugin === plugin);
    return record?.connectionId ?? null;
  }, [plugin, records]);

  const handleSubmit = async () => {
    if (!projectName || !plugin || !connectionId) {
      return;
    }

    const [success] = await operator(
      async () => {
        const { blueprint } = await API.project.create({
          name: projectName,
          description: '',
          metrics: [
            {
              pluginName: 'dora',
              pluginOption: '',
              enable: true,
            },
          ],
        });

        await API.scope.batch(plugin, connectionId, { data: scopes.map((it) => it.data) });

        await API.blueprint.update(blueprint.id, buildOnboardBlueprintUpdatePayload(plugin, connectionId, scopes));

        await API.blueprint.trigger(blueprint.id, { skipCollectors: false, fullSync: false });

        const pipeline = await API.blueprint.pipelines(blueprint.id);

        const newRecords = records.map((it) =>
          it.plugin !== plugin
            ? it
            : {
                ...it,
                blueprintId: blueprint.id,
                pipelineId: pipeline.pipelines[0].id,
                scopeName: getPluginScopeName(plugin, scopes[0]) || scopes[0]?.fullName || scopes[0]?.name,
              },
        );

        setRecords(newRecords);

        await API.store.set(STORE_KEY, {
          step: WIZARD_STEP.RESULT,
          records: newRecords,
          done,
          projectName,
          plugin,
        });
      },
      {
        setOperating,
        formatMessage: () => COPY.scope.congratulations,
      },
    );

    if (success) {
      setStep(step + 1);
    }
  };

  if (!plugin || !connectionId) {
    return null;
  }

  return (
    <>
      <S.StepContent>
        <S.Form>
          <DataScopeRemote
            mode="single"
            plugin={plugin}
            connectionId={connectionId}
            selectedScope={scopes}
            onChangeSelectedScope={setScopes}
          />
        </S.Form>
        <S.Guide>{guide}</S.Guide>
      </S.StepContent>
      <StepActions
        loading={operating}
        nextDisabled={!scopes.length}
        onPrevious={() => setStep(step - 1)}
        onNext={handleSubmit}
      />
    </>
  );
};
