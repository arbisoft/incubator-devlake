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

// The request log list, in DataTables' server-side mode: every filter, sort, page or page-size change asks the server for that one page.
(function ($) {
  'use strict';

  var $table = $('#request-logs');
  var $form = $('#request-log-filters');
  var $error = $('#request-log-error');
  var pageSizes = String($table.data('pageSizes')).split(',').map(Number);

  // The same clock icon the server renders for the history button on other lists.
  var historyIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>';

  // A failed load is shown in the page, not in a browser dialog.
  $.fn.dataTable.ext.errMode = 'none';

  // Cell text is built with jQuery's text(), so nothing the server sent is ever read as markup.
  function html($element) {
    return $('<div>').append($element).html();
  }

  var table = $table.DataTable({
    serverSide: true,
    processing: true,
    searching: false,
    lengthMenu: pageSizes,
    pageLength: Number($table.data('pageSize')),
    order: [[0, 'desc']],
    layout: { topStart: null, topEnd: null, bottomStart: 'info', bottomEnd: ['pageLength', 'paging'] },
    pagingType: 'simple_numbers',
    language: {
      lengthMenu: 'Rows per page _MENU_',
      info: 'Showing _START_ to _END_ of _TOTAL_ requests',
      infoEmpty: 'No requests',
      emptyTable: 'No requests match.',
      zeroRecords: 'No requests match.',
      processing: 'Loading...'
    },
    columns: [
      { data: 'created', name: 'created' },
      { data: 'modified', name: 'modified' },
      {
        data: 'client', orderable: false,
        render: function (name, type, row) {
          return html($('<span>').text(name).append(' ', $('<span class="mono muted">').text(row.clientId)));
        }
      },
      { data: 'eventType', name: 'event', className: 'mono' },
      {
        data: 'status', name: 'status',
        render: function (status, type, row) {
          return html($('<span>').addClass('badge ' + row.tone).text(status));
        }
      },
      { data: 'correlationId', name: 'correlation', className: 'mono' },
      {
        data: 'id', orderable: false, className: 'row-actions',
        render: function (id, type, row) {
          var open = $('<a>').attr('href', String($table.data('detailsUrl')).replace(/0$/, id)).text('Open');
          var history = $('<a class="icon-button" title="History" data-history>')
            .attr('href', String($table.data('historyUrl')).replace(/id=0$/, 'id=' + id))
            .attr('aria-label', 'History of request ' + row.correlationId)
            .attr('data-history-label', row.correlationId)
            .html(historyIcon);
          return html(open) + html(history);
        }
      }
    ],
    ajax: function (request, callback) {
      var sort = request.order.length ? request.order[0] : { column: 0, dir: 'desc' };
      var query = $form.serialize() + '&' + $.param({
        draw: request.draw,
        pageNumber: Math.floor(request.start / request.length) + 1,
        pageSize: request.length,
        sort: request.columns[sort.column].name,
        dir: sort.dir
      });
      $.ajax({ url: $table.data('listUrl') + '&' + query, dataType: 'json', cache: false })
        .done(function (answer) {
          $error.prop('hidden', true);
          callback(answer);
        })
        .fail(function (xhr, textStatus) {
          // A sign-in page where the data should be (a redirect the browser followed) is not JSON, so it fails to parse: the session ended.
          var signedOut = xhr.status === 401 || xhr.status === 403 || (xhr.status === 200 && textStatus === 'parsererror');
          $error.text(signedOut
            ? 'Your session ended. Reload the page and sign in again.'
            : 'The requests could not be loaded (' + (xhr.status ? 'HTTP ' + xhr.status : textStatus) + '). Reload the page to try again.');
          $error.prop('hidden', false);
          callback({ draw: request.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
        });
    }
  });

  // Applying a filter asks the server for the first page of the new result, without reloading the page.
  $form.on('submit', function (event) {
    event.preventDefault();
    table.draw();
  });

  $('#request-log-clear').on('click', function (event) {
    event.preventDefault();
    $form[0].reset();
    $form.find('select').val('');
    $form.find('input[type=date]').val('');
    table.draw();
  });
})(jQuery);
