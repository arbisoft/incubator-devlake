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
import { BasePage } from './common';

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Legacy URLs that the app redirects, checked with a query string that must survive the redirect.
export class RedirectsPage extends BasePage {
  private readonly query = 'e2e=kept';

  async openWithQuery(path: string): Promise<void> {
    await this.visit(`${path}?${this.query}`);
  }

  // Matches the URL ending with the path and the original query string.
  landedOn(path: string): RegExp {
    return new RegExp(`${escapeRegExp(path)}\\?${escapeRegExp(this.query)}$`);
  }
}
