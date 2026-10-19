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

export const MIN_PASSWORD_LENGTH = 15;

export const COPY = {
  title: 'Change password',
  heading: 'Change your password',
  forcedNotice: 'Choose a new password to continue.',
  currentLabel: 'Current password',
  currentRequired: 'Enter your current password.',
  newLabel: 'New password',
  tooShort: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  confirmLabel: 'Confirm new password',
  confirmRequired: 'Confirm your new password.',
  mismatch: 'Passwords do not match.',
  submit: 'Change password',
  failed: 'Unable to change the password. Check the current password and try again.',
};
