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
import { ConnectionForm, ConnectionList, ConnectionModal } from '@/plugins';
import { MODAL_WIDTH } from '@/ui';

type ManageModalProps = {
  open: boolean;
  plugin: string;
  isForm: boolean;
  onClose: () => void;
  onAfterClose: () => void;
  onCreate: () => void;
  onCreated: (plugin: string, id: ID) => void;
};

export const ManageModal = ({ open, plugin, isForm, onClose, onAfterClose, onCreate, onCreated }: ManageModalProps) => (
  <ConnectionModal
    open={open}
    plugin={plugin}
    width={isForm ? MODAL_WIDTH.MD : MODAL_WIDTH.LG}
    onCancel={onClose}
    afterClose={onAfterClose}
  >
    {plugin &&
      (isForm ? (
        <ConnectionForm plugin={plugin} onSuccess={(id) => onCreated(plugin, id)} />
      ) : (
        <ConnectionList plugin={plugin} onCreate={onCreate} />
      ))}
  </ConnectionModal>
);
