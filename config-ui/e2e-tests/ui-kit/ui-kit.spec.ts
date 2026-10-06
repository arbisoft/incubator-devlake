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
import { test, expect } from '../fixtures';
import { UI_KIT_URL } from '../support/env';
import { UiKitMode, UiKitPage } from '../support/pages/ui-kit';

const MODES: UiKitMode[] = ['light', 'dark'];

test.describe('ui-kit route', () => {
  test.skip(!UI_KIT_URL, 'E2E_UI_KIT_URL is not set; /ui-kit exists only on a `yarn start` server');

  for (const mode of MODES) {
    test(`${mode} theme renders every section without console errors`, async ({ page, browserErrors }) => {
      const uiKit = new UiKitPage(page);
      await uiKit.open(mode);
      await expect(uiKit.title).toBeVisible();
      await expect(uiKit.html).toHaveAttribute('data-theme', mode);
      for (const title of uiKit.sectionTitles) {
        await expect(uiKit.sectionHeading(title)).toBeVisible();
      }
      expect(browserErrors).toEqual([]);
    });
  }
});
