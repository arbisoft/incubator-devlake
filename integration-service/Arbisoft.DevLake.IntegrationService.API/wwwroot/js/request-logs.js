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
    layout: { topStart: 'pageLength', topEnd: null, bottomStart: 'info', bottomEnd: 'paging' },
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
        data: 'id', orderable: false,
        render: function (id) {
          return html($('<a>').attr('href', String($table.data('detailsUrl')).replace(/0$/, id)).text('Open'));
        }
      }
    ],
    ajax: function (request, callback) {
      var sort = request.order.length ? request.order[0] : { column: 0, dir: 'desc' };
      var query = $form.serialize() + '&' + $.param({
        draw: request.draw,
        page: Math.floor(request.start / request.length) + 1,
        pageSize: request.length,
        sort: request.columns[sort.column].name,
        dir: sort.dir
      });
      $.ajax({ url: $table.data('listUrl') + '&' + query, dataType: 'json', cache: false })
        .done(function (answer) {
          $error.prop('hidden', true);
          callback(answer);
        })
        .fail(function () {
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
