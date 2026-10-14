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

import { DeleteOutlined, MoreOutlined } from '@ant-design/icons';
import { Button, Dropdown, Switch, Tooltip } from 'antd';
import { Fragment, type ReactNode, useRef } from 'react';

import { ConfirmModal, IconButton, ICON_BUTTON_TONE } from '@/ui';

import { CONFIRM_KIND, COPY, MORE_MENU_KEY, STATUS_ACTION, STATUS_ACTIONS } from './constants';
import { useBlueprintActions } from './hooks';
import { ActionNote, EnabledSwitch } from './styled';
import type { StatusActionsProps } from './types';
import { getNextRunLabel } from './utils';

export const StatusActions = ({ context, blueprint, onRefresh }: StatusActionsProps) => {
  const { operating, trigger, setEnabled, requestConfirm, confirmProps } = useBlueprintActions({
    blueprint,
    onRefresh,
  });
  const moreButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const disabled = !blueprint.enable;
  const inProject = !!blueprint.projectName;

  const renderers: Record<(typeof STATUS_ACTION)[keyof typeof STATUS_ACTION], ReactNode> = {
    [STATUS_ACTION.NEXT_RUN]: <ActionNote>{getNextRunLabel(blueprint.isManual, blueprint.cronConfig)}</ActionNote>,
    [STATUS_ACTION.RE_TRANSFORM]: (
      <Tooltip placement="top" title={COPY.actions.reTransformHint}>
        <Button
          type="primary"
          disabled={disabled}
          loading={operating}
          onClick={() => trigger({ skipCollectors: true, fullSync: true })}
        >
          {COPY.actions.reTransform}
        </Button>
      </Tooltip>
    ),
    [STATUS_ACTION.COLLECT]: (
      <Button disabled={disabled} loading={operating} onClick={() => trigger()}>
        {COPY.actions.collect}
      </Button>
    ),
    [STATUS_ACTION.MORE]: (
      <Dropdown
        trigger={['click']}
        menu={{
          items: [{ key: MORE_MENU_KEY.FULL_REFRESH, label: COPY.actions.fullRefresh, disabled }],
          onClick: ({ key }) => {
            if (key !== MORE_MENU_KEY.FULL_REFRESH) return;
            opener.current = moreButton.current;
            requestConfirm(CONFIRM_KIND.FULL_REFRESH);
          },
        }}
      >
        <Button ref={moreButton} icon={<MoreOutlined />} aria-label={COPY.actions.more} />
      </Dropdown>
    ),
    [STATUS_ACTION.RUN_NOW]: (
      <Button type="primary" disabled={disabled} loading={operating} onClick={() => trigger()}>
        {COPY.actions.runNow}
      </Button>
    ),
    [STATUS_ACTION.ENABLED]: (
      <EnabledSwitch>
        <Switch disabled={inProject} checked={blueprint.enable} onChange={setEnabled} />
        {COPY.actions.enabled}
      </EnabledSwitch>
    ),
    [STATUS_ACTION.DELETE]: (
      <IconButton
        icon={<DeleteOutlined />}
        label={COPY.actions.delete}
        tone={ICON_BUTTON_TONE.DANGER}
        disabled={inProject}
        loading={operating}
        onClick={() => {
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          requestConfirm(CONFIRM_KIND.DELETE);
        }}
      />
    ),
  };

  return (
    <>
      {STATUS_ACTIONS[context].map((action) => (
        <Fragment key={action}>{renderers[action]}</Fragment>
      ))}
      <ConfirmModal {...confirmProps} afterClose={() => opener.current?.focus()} />
    </>
  );
};
