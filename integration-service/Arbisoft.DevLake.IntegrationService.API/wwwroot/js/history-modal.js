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
 */

// Opens an object's history in a dialog instead of a new page. Any link marked data-history works, including the ones the request log table
// draws after the page has loaded. A click with a modifier key still opens the page, so the history can be opened in a new tab.
(function () {
  'use strict';

  var dialog = document.getElementById('history-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') {
    return;
  }

  var title = document.getElementById('history-dialog-title');
  var body = document.getElementById('history-dialog-body');
  var loading = 0;

  function modalUrl(href) {
    var url = new URL(href, window.location.href);
    url.searchParams.set('handler', 'Modal');
    return url.toString();
  }

  function show(message) {
    body.replaceChildren();
    var p = document.createElement('p');
    p.className = 'muted';
    p.textContent = message;
    body.appendChild(p);
  }

  // The heading names the object as the row the dialog was opened from shows it now, or else as the trail last recorded it.
  function heading(name, kind) {
    title.textContent = 'History of ' + name + (kind ? ' · ' + kind : '');
  }

  // The answer is HTML the portal rendered from its own templates, with every value encoded, so it is put in the dialog as it is.
  function load(href, name) {
    var request = ++loading;
    show('Loading...');
    fetch(modalUrl(href), { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (response) {
        if (!response.ok || response.redirected) {
          throw new Error(response.status);
        }

        return response.text();
      })
      .then(function (html) {
        if (request !== loading) {
          return;
        }

        body.innerHTML = html;
        var content = body.querySelector('[data-history-kind]');
        if (content) {
          heading(name || content.getAttribute('data-history-name') || '', content.getAttribute('data-history-kind'));
        }
      })
      .catch(function () {
        if (request === loading) {
          show('The history could not be loaded. Reload the page, and sign in again if the session ended.');
        }
      });
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[data-history], #history-dialog a[data-history-page-link]');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();

    // Paging inside the dialog keeps the name the dialog was opened with.
    var name = link.hasAttribute('data-history-page-link') ? dialog.getAttribute('data-name') : link.getAttribute('data-history-label');
    dialog.setAttribute('data-name', name || '');
    if (!link.hasAttribute('data-history-page-link')) {
      heading(name || '', '');
    }

    load(link.href, name || '');
    if (!dialog.open) {
      dialog.showModal();
    }
  });

  document.getElementById('history-dialog-close').addEventListener('click', function () {
    dialog.close();
  });

  // A click on the dimmed backdrop lands on the dialog itself, outside its content box.
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) {
      dialog.close();
    }
  });
})();
