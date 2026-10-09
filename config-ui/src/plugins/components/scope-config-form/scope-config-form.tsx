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

import { Alert, ConfigProvider, Form, Button } from 'antd';
import { useTheme } from 'styled-components';

import { Message } from '@/components';
import { transformEntities } from '@/config/entities';
import { DOC_URL } from '@/release';
import { ExternalLink } from '@/ui';

import { COPY, SCOPE_CONFIG_STEP } from './constants';
import { StepDetails } from './step-details';
import { Footer, Notice, Progress, Root, Transformations } from './styled';
import { renderTransformation } from './transformations';
import type { ScopeConfigFormProps } from './types';
import { useScopeConfigForm } from './use-scope-config-form';
import { isDetailsValid } from './utils';

const STEP_ITEMS = [{ title: COPY.steps.details }, { title: COPY.steps.transformations }];

export const ScopeConfigForm = ({
  plugin,
  connectionId,
  defaultName,
  showWarning = false,
  forceCreate = false,
  scopeId,
  scopeConfigId,
  onCancel,
  onSubmit,
}: ScopeConfigFormProps) => {
  const { colors, radius } = useTheme();
  const form = useScopeConfigForm({ plugin, connectionId, defaultName, forceCreate, scopeConfigId, onSubmit });
  const { config, step } = form;

  const pluginDoc = DOC_URL.PLUGIN[config.plugin.toUpperCase() as keyof typeof DOC_URL.PLUGIN];
  const transformationDoc =
    typeof pluginDoc === 'object' && pluginDoc && 'TRANSFORMATION' in pluginDoc ? pluginDoc.TRANSFORMATION : undefined;

  return (
    <Root>
      {transformationDoc && (
        <Alert
          title={
            <>
              {COPY.doc(config.name)} <ExternalLink href={transformationDoc}>{COPY.docLink}</ExternalLink>.
            </>
          }
        />
      )}
      <Progress current={step} items={STEP_ITEMS} />
      {step === SCOPE_CONFIG_STEP.DETAILS && (
        <>
          <StepDetails
            name={form.name}
            entities={form.entities}
            entityOptions={transformEntities(config.scopeConfig?.entities ?? [])}
            showWarning={showWarning}
            onNameChange={form.setName}
            onEntitiesChange={form.setEntities}
          />
          <Footer>
            <Button
              type="primary"
              disabled={!isDetailsValid(form.name, form.entities)}
              onClick={form.toTransformations}
            >
              {COPY.next}
            </Button>
            <Button onClick={onCancel}>{COPY.cancel}</Button>
          </Footer>
        </>
      )}
      {step === SCOPE_CONFIG_STEP.TRANSFORMATIONS && (
        <>
          {showWarning && (
            <Notice>
              <Message content={COPY.transformationsWarning} />
            </Notice>
          )}
          <ConfigProvider theme={{ token: { colorFillAlter: colors.primarySubtle, borderRadiusLG: radius.lg } }}>
            <Transformations>
              <Form labelCol={{ span: 7 }} wrapperCol={{ span: 17 }} labelAlign="left">
                {renderTransformation(plugin, {
                  entities: form.entities,
                  connectionId,
                  scopeId,
                  scopeConfigId,
                  transformation: form.transformation,
                  setTransformation: form.setTransformation,
                  setHasError: form.setHasError,
                })}
              </Form>
            </Transformations>
          </ConfigProvider>
          <Footer>
            <Button type="primary" loading={form.operating} disabled={form.hasError} onClick={form.submit}>
              {COPY.save}
            </Button>
            <Button onClick={form.toDetails}>{COPY.previous}</Button>
          </Footer>
        </>
      )}
    </Root>
  );
};
