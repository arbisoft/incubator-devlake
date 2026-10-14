<!--
Licensed to the Apache Software Foundation (ASF) under one or more
contributor license agreements.  See the NOTICE file distributed with
this work for additional information regarding copyright ownership.
The ASF licenses this file to You under the Apache License, Version 2.0
(the "License"); you may not use this file except in compliance with
the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

# Security

Security findings are always reported, even in code outside the diff.

## Cross-site scripting (XSS)

- `dangerouslySetInnerHTML` with anything not sanitized (`DOMPurify.sanitize`) → 🔴. Same for markdown renderers with raw HTML enabled (`rehype-raw`, `html: true`) on untrusted content.
- Direct DOM sinks via refs or `document`: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`.
- `eval`, `new Function`, `setTimeout`/`setInterval` with a string argument.
- URLs from data or user input in `href`/`src`/`window.location` without protocol validation → `javascript:` URLs execute. Allow-list `http:`, `https:`, `mailto:`:
  ```ts
  export const isSafeUrl = (url: string) => {
    try { return SAFE_PROTOCOLS.includes(new URL(url, window.location.origin).protocol); }
    catch { return false; }
  };
  ```
- Building HTML strings by concatenation; user input in `style` or CSS-in-JS templates.

## Tokens, cookies and storage

- Auth/refresh tokens belong in **HttpOnly, Secure, SameSite** cookies set by the server. The `HttpOnly` flag can't be set from JavaScript, so on the frontend check that tokens never reach JS-readable storage:
  - 🔴 tokens in `localStorage`, `sessionStorage`, IndexedDB, persisted Redux state, or written with `document.cookie`
  - 🔴 tokens in URLs or query strings (they leak via history, logs, `Referer`)
  - the http client uses `withCredentials: true` / `credentials: 'include'` and does not attach an `Authorization` header from storage
- Cookie auth needs CSRF protection: `SameSite=Lax/Strict` plus a CSRF token header on mutating requests. Flag mutating requests with no CSRF mechanism **(verify)** with backend.
- No PII or secrets in `localStorage`, console logs, error reports or analytics events.

## Secrets in the bundle

- Anything in `VITE_*`, `REACT_APP_*`, `NEXT_PUBLIC_*` ships to every browser. Flag API secrets, private keys, DB credentials or admin tokens there → 🔴.
- Hard-coded keys, passwords or tokens in source.

## Navigation and messaging

- Open redirects: `?redirect=`/`returnUrl` used without validating it's same-origin or allow-listed.
- `target="_blank"` on external links without `rel="noopener noreferrer"`.
- `window.addEventListener('message', …)` without checking `event.origin`; `postMessage(data, '*')` with sensitive data.
- `<iframe>` with untrusted content and no `sandbox`.

## Injection into requests

- User input interpolated into URL paths/query strings without `encodeURIComponent` (or the client's `params` option).
- Client-side permission checks are UX only. If code hides admin actions purely on the client, note that the server must enforce it **(verify)**.
- File uploads: validate type and size client-side for UX; never trust file names in rendered HTML.

## Dependencies and third parties

- New dependencies: maintained, reputable, no known vulnerabilities (`npm audit`), not duplicating an existing library.
- Third-party scripts from CDNs without Subresource Integrity (`integrity` attribute).
