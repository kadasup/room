(function (global) {
  'use strict';

  var WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
  var DEFAULT_STATUS_TEXT = {
    free: '可預約',
    full: '已客滿',
    loading: '讀取中',
    past: '已過去',
  };

  function createCalendar(options) {
    if (!options || !options.apiBase) {
      throw new Error('RoomCalendar.create: apiBase is required');
    }
    if (!options.monthInput || !options.calendarsContainer) {
      throw new Error(
        'RoomCalendar.create: monthInput and calendarsContainer are required'
      );
    }

    var apiBase = options.apiBase;
    var adminToken = options.adminToken || null;
    var monthInput = options.monthInput;
    var calendarsContainer = options.calendarsContainer;
    var lastSyncEl = options.lastSyncEl || null;
    var summaryEl = options.summaryEl || null;
    var viewSpanMonths = options.viewSpanMonths || 3;
    var contactPhone = options.contactPhone || '';
    var statusText = Object.assign({}, DEFAULT_STATUS_TEXT, options.statusText);
    var onCellAction =
      typeof options.onCellAction === 'function' ? options.onCellAction : null;
    var onStateUpdated =
      typeof options.onStateUpdated === 'function' ? options.onStateUpdated : null;
    var monthSummaryFormatter =
      typeof options.monthSummaryFormatter === 'function'
        ? options.monthSummaryFormatter
        : defaultMonthSummaryFormatter;
    var summaryFormatter =
      typeof options.summaryFormatter === 'function'
        ? options.summaryFormatter
        : defaultSummaryFormatter;
    var holidayLoader =
      typeof options.holidayLoader === 'function' ? options.holidayLoader : null;

    var stateCache = {};
    var holidayCache = {};
    var loadedStateYears = {};
    var loadedHolidayYears = {};
    var todayStr = fmtDate(new Date());

    function fmtDate(date) {
      return date.toISOString().slice(0, 10);
    }

    function ymd(y, m, day) {
      return (
        y +
        '-' +
        String(m).padStart(2, '0') +
        '-' +
        String(day).padStart(2, '0')
      );
    }

    function monthDays(y, m) {
      var last = new Date(y, m, 0).getDate();
      var out = [];
      for (var day = 1; day <= last; day += 1) {
        out.push(day);
      }
      return out;
    }

    function isWeekend(y, m, day) {
      var weekday = new Date(y, m - 1, day).getDay();
      return weekday === 0 || weekday === 6;
    }

    function getMonthRange() {
      var parts = monthInput.value.split('-');
      var y = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10);
      return { y: y, m: m };
    }

    function clampMonthInput() {
      var current = getMonthRange();
      var minParts = monthInput.min.split('-');
      var maxParts = monthInput.max.split('-');
      var minY = parseInt(minParts[0], 10);
      var minM = parseInt(minParts[1], 10);
      var maxY = parseInt(maxParts[0], 10);
      var maxM = parseInt(maxParts[1], 10);

      if (current.y < minY || (current.y === minY && current.m < minM)) {
        monthInput.value = minY + '-' + String(minM).padStart(2, '0');
      } else if (
        current.y > maxY ||
        (current.y === maxY && current.m > maxM)
      ) {
        monthInput.value = maxY + '-' + String(maxM).padStart(2, '0');
      }
    }

    function initSelectors() {
      var now = new Date();
      var minMonth =
        now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      var maxDate = new Date(now.getFullYear(), now.getMonth() + 23, 1);
      var maxMonth =
        maxDate.getFullYear() +
        '-' +
        String(maxDate.getMonth() + 1).padStart(2, '0');
      monthInput.min = minMonth;
      monthInput.max = maxMonth;
      if (!monthInput.value) {
        monthInput.value = minMonth;
      }
      clampMonthInput();
    }

    function getVisibleMonths() {
      clampMonthInput();
      var start = getMonthRange();
      var out = [];

      for (var index = 0; index < viewSpanMonths; index += 1) {
        var date = new Date(start.y, start.m - 1 + index, 1);
        out.push({
          y: date.getFullYear(),
          m: date.getMonth() + 1,
        });
      }

      return out;
    }

    async function apiGet(year) {
      var url = new URL(apiBase);
      url.searchParams.set('year', String(year));
      url.searchParams.set('t', Date.now().toString());
      var res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('GET failed ' + res.status);
      }
      var json = await res.json();
      stateCache[year] = (json && json.status) || {};
      loadedStateYears[year] = true;
      return json;
    }

    async function apiPatch(year, delta) {
      if (!adminToken) {
        throw new Error('No admin token configured');
      }
      var form = new FormData();
      form.append('token', adminToken);
      form.append('year', String(year));
      form.append('delta', JSON.stringify(delta));

      var res = await fetch(apiBase, {
        method: 'POST',
        body: form,
        redirect: 'follow',
      });

      if (!res.ok) {
        throw new Error('POST failed ' + res.status);
      }

      var json = await res.json();
      if (json && json.data && json.data.status) {
        stateCache[year] = json.data.status;
      }
      return json;
    }

    async function ensureMetaLoaded(year) {
      if (!holidayLoader || loadedHolidayYears[year]) {
        return;
      }
      holidayCache[year] = await holidayLoader(year);
      loadedHolidayYears[year] = true;
    }

    async function ensureYearsLoaded() {
      var months = getVisibleMonths();
      var uniqueYears = {};
      var requests = [];

      months.forEach(function (month) {
        uniqueYears[month.y] = true;
      });

      Object.keys(uniqueYears).forEach(function (yearKey) {
        var year = parseInt(yearKey, 10);
        if (!loadedStateYears[year]) {
          requests.push(apiGet(year));
        }
        if (holidayLoader && !loadedHolidayYears[year]) {
          requests.push(ensureMetaLoaded(year));
        }
      });

      if (requests.length) {
        await Promise.all(requests);
      }
    }

    function getHolidayName(dateStr) {
      var year = parseInt(dateStr.slice(0, 4), 10);
      return holidayCache[year] && holidayCache[year][dateStr]
        ? holidayCache[year][dateStr]
        : '';
    }

    function updateSyncText(text) {
      if (lastSyncEl) {
        lastSyncEl.textContent = text;
      }
    }

    function summarizeVisibleMonths() {
      var months = getVisibleMonths();
      var summary = {
        free: 0,
        full: 0,
        totalVisible: 0,
      };

      months.forEach(function (month) {
        monthDays(month.y, month.m).forEach(function (day) {
          var dateStr = ymd(month.y, month.m, day);
          if (dateStr < todayStr) {
            return;
          }
          var status =
            (stateCache[month.y] && stateCache[month.y][dateStr]) || 'free';
          summary.totalVisible += 1;
          if (status === 'full') {
            summary.full += 1;
          } else {
            summary.free += 1;
          }
        });
      });

      if (summaryEl) {
        summaryEl.textContent = summaryFormatter(summary);
      }

      return summary;
    }

    function defaultSummaryFormatter(summary) {
      return (
        '接下來 ' +
        String(viewSpanMonths) +
        ' 個月共有 ' +
        String(summary.free) +
        ' 天可預約，' +
        String(summary.full) +
        ' 天已客滿'
      );
    }

    function defaultMonthSummaryFormatter(summary) {
      return (
        '可預約 ' +
        String(summary.free).padStart(2, '0') +
        ' 天 / 已客滿 ' +
        String(summary.full).padStart(2, '0') +
        ' 天'
      );
    }

    function getMonthSummary(y, m) {
      var summary = { free: 0, full: 0 };
      monthDays(y, m).forEach(function (day) {
        var dateStr = ymd(y, m, day);
        if (dateStr < todayStr) {
          return;
        }
        var status = (stateCache[y] && stateCache[y][dateStr]) || 'free';
        if (status === 'full') {
          summary.full += 1;
        } else {
          summary.free += 1;
        }
      });
      return summary;
    }

    function createStateNode(status, dateStr, isPast, isLoading) {
      var node;
      if (isLoading) {
        node = document.createElement('span');
        node.className = 'state-badge loading';
        node.textContent = statusText.loading;
        return node;
      }

      if (isPast) {
        node = document.createElement('span');
        node.className = 'state-badge past';
        node.textContent = statusText.past;
        return node;
      }

      if (status === 'free' && contactPhone) {
        node = document.createElement('a');
        node.href = 'tel:' + contactPhone;
      } else {
        node = document.createElement('span');
      }

      node.className = 'state-badge ' + (status === 'full' ? 'full' : 'free');
      node.textContent = statusText[status] || status;
      return node;
    }

    function buildDayCell(y, m, day) {
      var dateStr = ymd(y, m, day);
      var holidayName = getHolidayName(dateStr);
      var isPast = dateStr < todayStr;
      var isToday = dateStr === todayStr;
      var isLoaded = Boolean(loadedStateYears[y]);
      var status = (stateCache[y] && stateCache[y][dateStr]) || 'free';

      var td = document.createElement('td');
      var cell = document.createElement('div');
      var header = document.createElement('div');
      var dateEl = document.createElement('span');
      var holidayEl = document.createElement('span');
      var todayBadge = document.createElement('span');
      var stateEl = createStateNode(status, dateStr, isPast, !isLoaded);

      cell.className =
        'calendar-day' +
        (isWeekend(y, m, day) ? ' weekend' : '') +
        (isToday ? ' today' : '') +
        (isPast ? ' past' : '') +
        (adminToken && !isPast ? ' is-admin' : '');

      header.className = 'calendar-day-header';
      dateEl.className = 'date-number';
      dateEl.textContent = String(day);
      header.appendChild(dateEl);

      if (holidayName) {
        holidayEl.className = 'holiday-label';
        holidayEl.textContent = holidayName;
        header.appendChild(holidayEl);
      }

      cell.appendChild(header);

      if (isToday) {
        todayBadge.className = 'today-badge';
        todayBadge.textContent = '今天';
        cell.appendChild(todayBadge);
      }

      cell.appendChild(stateEl);
      td.appendChild(cell);

      if (adminToken && !isPast) {
        td.addEventListener('click', async function () {
          var current = (stateCache[y] && stateCache[y][dateStr]) || 'free';
          var next = current === 'full' ? 'free' : 'full';
          stateCache[y] = stateCache[y] || {};
          stateCache[y][dateStr] = next;
          render();

          try {
            await apiPatch(y, (function () {
              var delta = {};
              delta[dateStr] = next;
              return delta;
            })());
            updateSyncText('已於 ' + new Date().toLocaleString() + ' 同步');
            if (onStateUpdated) {
              onStateUpdated({
                y: y,
                m: m,
                day: day,
                dateStr: dateStr,
                state: next,
              });
            }
          } catch (error) {
            stateCache[y][dateStr] = current;
            render();
            updateSyncText('同步失敗');
            alert(
              '更新失敗，已還原原本狀態。' +
                (error && error.message ? ' ' + error.message : '')
            );
          }
        });
      } else if (onCellAction) {
        onCellAction({
          y: y,
          m: m,
          day: day,
          dateStr: dateStr,
          isPast: isPast,
          status: status,
          td: td,
          cell: cell,
          stateNode: stateEl,
          holidayName: holidayName,
        });
      }

      return td;
    }

    function render() {
      var months = getVisibleMonths();
      calendarsContainer.innerHTML = '';

      months.forEach(function (month) {
        var wrapper = document.createElement('section');
        var header = document.createElement('div');
        var title = document.createElement('h2');
        var counts = document.createElement('div');
        var table = document.createElement('table');
        var thead = document.createElement('thead');
        var tbody = document.createElement('tbody');
        var firstDay = new Date(month.y, month.m - 1, 1).getDay();
        var days = monthDays(month.y, month.m);
        var row = document.createElement('tr');

        wrapper.className = 'calendar-card';
        header.className = 'calendar-head';
        title.className = 'calendar-title';
        counts.className = 'month-counts';
        title.textContent = month.y + ' 年 ' + month.m + ' 月';
        counts.textContent = monthSummaryFormatter(getMonthSummary(month.y, month.m));
        header.appendChild(title);
        header.appendChild(counts);
        wrapper.appendChild(header);

        table.className = 'calendar-table';
        thead.innerHTML =
          '<tr>' +
          WEEKDAY_LABELS.map(function (label) {
            return '<th scope="col">' + label + '</th>';
          }).join('') +
          '</tr>';
        table.appendChild(thead);

        for (var gap = 0; gap < firstDay; gap += 1) {
          var emptyTd = document.createElement('td');
          var emptyCell = document.createElement('div');
          emptyCell.className = 'calendar-day empty';
          emptyTd.appendChild(emptyCell);
          row.appendChild(emptyTd);
        }

        days.forEach(function (day) {
          row.appendChild(buildDayCell(month.y, month.m, day));
          if ((firstDay + day) % 7 === 0) {
            tbody.appendChild(row);
            row = document.createElement('tr');
          }
        });

        if (row.children.length > 0) {
          while (row.children.length < 7) {
            var tailTd = document.createElement('td');
            var tailCell = document.createElement('div');
            tailCell.className = 'calendar-day empty';
            tailTd.appendChild(tailCell);
            row.appendChild(tailTd);
          }
          tbody.appendChild(row);
        }

        table.appendChild(tbody);
        wrapper.appendChild(table);
        calendarsContainer.appendChild(wrapper);
      });

      summarizeVisibleMonths();
    }

    async function reload() {
      updateSyncText('正在同步資料...');
      await ensureYearsLoaded();
      render();
      updateSyncText('已於 ' + new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }) + ' 更新');
    }

    function goToday() {
      var now = new Date();
      monthInput.value =
        now.getFullYear() +
        '-' +
        String(now.getMonth() + 1).padStart(2, '0');
      clampMonthInput();
    }

    function shiftMonths(delta) {
      var current = getMonthRange();
      var nextDate = new Date(current.y, current.m - 1 + delta, 1);
      monthInput.value =
        nextDate.getFullYear() +
        '-' +
        String(nextDate.getMonth() + 1).padStart(2, '0');
      clampMonthInput();
    }

    initSelectors();

    return {
      reload: reload,
      render: render,
      goToday: goToday,
      shiftMonths: shiftMonths,
      monthDays: monthDays,
      ymd: ymd,
      todayStr: todayStr,
      getStartYM: function () {
        var current = getMonthRange();
        return [current.y, current.m];
      },
      get cache() {
        return stateCache;
      },
      get holidays() {
        return holidayCache;
      },
      patch: adminToken ? apiPatch : null,
    };
  }

  global.RoomCalendar = { create: createCalendar };
})(window);
