(function (global) {
  'use strict';

  var WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
  var DEFAULT_STATUS_TEXT = {
    free: '',
    full: '客滿',
    loading: '',
    past: '',
  };
  var HOLIDAY_SOURCE =
    'https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/';

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function formatDate(date) {
    return (
      date.getFullYear() +
      '-' +
      pad2(date.getMonth() + 1) +
      '-' +
      pad2(date.getDate())
    );
  }

  function monthKeyFromDate(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1);
  }

  function monthStart(year, month) {
    return new Date(year, month - 1, 1);
  }

  function addMonths(year, month, delta) {
    var date = new Date(year, month - 1 + delta, 1);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  }

  function parseMonthValue(value) {
    var parts = String(value || '').split('-');
    return {
      year: parseInt(parts[0], 10),
      month: parseInt(parts[1], 10),
    };
  }

  function isValidMonth(monthValue) {
    return (
      monthValue &&
      Number.isFinite(monthValue.year) &&
      Number.isFinite(monthValue.month) &&
      monthValue.month >= 1 &&
      monthValue.month <= 12
    );
  }

  function updateElementText(node, value) {
    if (node) {
      node.textContent = value;
    }
  }

  function defaultSummaryFormatter(summary, viewSpanMonths) {
    return (
      '未來 ' +
      String(viewSpanMonths) +
      ' 個月共 ' +
      String(summary.free) +
      ' 天可安排，' +
      String(summary.full) +
      ' 天客滿'
    );
  }

  function defaultMonthSummaryFormatter(summary) {
    return (
      '可安排 ' +
      String(summary.free).padStart(2, '0') +
      ' 天 / 客滿 ' +
      String(summary.full).padStart(2, '0') +
      ' 天'
    );
  }

  function createHolidayLoader(options) {
    var settings = options || {};
    var cachePrefix = settings.cachePrefix || 'room-holidays-';
    var normalize =
      typeof settings.normalize === 'function' ? settings.normalize : null;

    function getCachedYear(year) {
      try {
        var raw = localStorage.getItem(cachePrefix + String(year));
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        return parsed && parsed.data ? parsed.data : null;
      } catch (error) {
        return null;
      }
    }

    function setCachedYear(year, data) {
      try {
        localStorage.setItem(
          cachePrefix + String(year),
          JSON.stringify({
            cachedAt: Date.now(),
            data: data,
          })
        );
      } catch (error) {
        // Ignore storage failures.
      }
    }

    return async function loadTaiwanHolidays(year) {
      var cached = getCachedYear(year);
      if (cached) {
        return cached;
      }

      var response = await fetch(HOLIDAY_SOURCE + String(year) + '.json');
      if (!response.ok) {
        throw new Error('holiday fetch failed: ' + response.status);
      }

      var list = await response.json();
      var map = {};
      list.forEach(function (item) {
        if (!item.isHoliday || !item.description) {
          return;
        }

        var dateValue = String(item.date || '');
        var dateStr =
          dateValue.slice(0, 4) +
          '-' +
          dateValue.slice(4, 6) +
          '-' +
          dateValue.slice(6, 8);
        map[dateStr] = normalize ? normalize(item.description) : item.description;
      });

      setCachedYear(year, map);
      return map;
    };
  }

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
    var adminToken = options.adminToken || '';
    var monthInput = options.monthInput;
    var calendarsContainer = options.calendarsContainer;
    var lastSyncEl = options.lastSyncEl || null;
    var summaryEl = options.summaryEl || null;
    var viewSpanMonths = options.viewSpanMonths || 3;
    var holidayLoader =
      typeof options.holidayLoader === 'function' ? options.holidayLoader : null;
    var onStateUpdated =
      typeof options.onStateUpdated === 'function' ? options.onStateUpdated : null;
    var onRenderComplete =
      typeof options.onRenderComplete === 'function'
        ? options.onRenderComplete
        : null;
    var monthSummaryFormatter =
      typeof options.monthSummaryFormatter === 'function'
        ? options.monthSummaryFormatter
        : defaultMonthSummaryFormatter;
    var summaryFormatter =
      typeof options.summaryFormatter === 'function'
        ? options.summaryFormatter
        : defaultSummaryFormatter;
    var showMonthSummary = options.showMonthSummary !== false;
    var statusText = Object.assign({}, DEFAULT_STATUS_TEXT, options.statusText);

    var isAdmin = Boolean(adminToken);
    var stateCache = {};
    var holidayCache = {};
    var loadedStateYears = {};
    var loadedHolidayYears = {};
    var loadingYears = {};
    var todayStr = formatDate(new Date());

    function ymd(year, month, day) {
      return year + '-' + pad2(month) + '-' + pad2(day);
    }

    function monthDays(year, month) {
      var last = new Date(year, month, 0).getDate();
      var out = [];
      var day;
      for (day = 1; day <= last; day += 1) {
        out.push(day);
      }
      return out;
    }

    function getStartYM() {
      return parseMonthValue(monthInput.value);
    }

    function getBoundDate(value) {
      var monthValue = parseMonthValue(value);
      return monthStart(monthValue.year, monthValue.month);
    }

    function ensureMonthRange() {
      var now = new Date();
      var maxStartOffset = Math.max(0, 24 - viewSpanMonths);
      var minValue = monthKeyFromDate(new Date(now.getFullYear(), now.getMonth(), 1));
      var maxValue = monthKeyFromDate(
        new Date(now.getFullYear(), now.getMonth() + maxStartOffset, 1)
      );

      monthInput.min = minValue;
      monthInput.max = maxValue;

      if (!monthInput.value) {
        monthInput.value = minValue;
      }

      clampMonthInput();
    }

    function clampMonthInput() {
      var current = getStartYM();
      if (!isValidMonth(current)) {
        monthInput.value = monthInput.min;
        return;
      }

      var currentDate = monthStart(current.year, current.month);
      var minDate = getBoundDate(monthInput.min);
      var maxDate = getBoundDate(monthInput.max);

      if (currentDate < minDate) {
        monthInput.value = monthInput.min;
      } else if (currentDate > maxDate) {
        monthInput.value = monthInput.max;
      }
    }

    function getVisibleMonths() {
      var start = getStartYM();
      var months = [];
      var index;

      clampMonthInput();
      for (index = 0; index < viewSpanMonths; index += 1) {
        months.push(addMonths(start.year, start.month, index));
      }

      return months;
    }

    function formatUpdatedAt(value) {
      if (!value) {
        return '同步完成';
      }

      var date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return '同步完成';
      }

      return (
        '更新於 ' +
        String(date.getMonth() + 1) +
        '/' +
        String(date.getDate()) +
        ' ' +
        pad2(date.getHours()) +
        ':' +
        pad2(date.getMinutes())
      );
    }

    function canShiftMonths(delta) {
      var start = getStartYM();
      var target = addMonths(start.year, start.month, delta);
      var targetDate = monthStart(target.year, target.month);
      var minDate = getBoundDate(monthInput.min);
      var maxDate = getBoundDate(monthInput.max);
      return targetDate >= minDate && targetDate <= maxDate;
    }

    function shiftMonths(delta) {
      if (!canShiftMonths(delta)) {
        return false;
      }
      var start = getStartYM();
      var target = addMonths(start.year, start.month, delta);
      monthInput.value = target.year + '-' + pad2(target.month);
      return true;
    }

    function goToday() {
      monthInput.value = monthInput.min;
    }

    async function apiGet(year) {
      var url = new URL(apiBase);
      url.searchParams.set('year', String(year));
      url.searchParams.set('t', String(Date.now()));

      var response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('GET failed ' + response.status);
      }

      var payload = await response.json();
      if (!payload || payload.ok === false) {
        throw new Error((payload && payload.error) || 'GET failed');
      }

      stateCache[year] = payload.status || {};
      loadedStateYears[year] = true;
      updateElementText(lastSyncEl, formatUpdatedAt(payload.updatedAt));
      return payload;
    }

    async function patch(year, delta) {
      if (!adminToken) {
        throw new Error('No admin token configured');
      }

      var form = new FormData();
      form.append('token', adminToken);
      form.append('year', String(year));
      form.append('delta', JSON.stringify(delta));

      var response = await fetch(apiBase, {
        method: 'POST',
        body: form,
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error('POST failed ' + response.status);
      }

      var payload = await response.json();
      if (!payload || payload.ok === false) {
        throw new Error((payload && payload.error) || 'POST failed');
      }

      if (payload.data && payload.data.status) {
        stateCache[year] = payload.data.status;
      } else {
        stateCache[year] = stateCache[year] || {};
        Object.keys(delta).forEach(function (dateStr) {
          stateCache[year][dateStr] = delta[dateStr];
        });
      }

      loadedStateYears[year] = true;
      updateElementText(lastSyncEl, formatUpdatedAt(payload.updatedAt));
      return payload;
    }

    async function ensureHolidayYear(year) {
      if (!holidayLoader || loadedHolidayYears[year] || loadingYears['h' + year]) {
        return;
      }

      loadingYears['h' + year] = true;
      try {
        holidayCache[year] = await holidayLoader(year);
        loadedHolidayYears[year] = true;
      } finally {
        delete loadingYears['h' + year];
      }
    }

    async function ensureStateYear(year) {
      if (loadedStateYears[year] || loadingYears['s' + year]) {
        return;
      }

      loadingYears['s' + year] = true;
      try {
        await apiGet(year);
      } finally {
        delete loadingYears['s' + year];
      }
    }

    async function ensureVisibleData() {
      var months = getVisibleMonths();
      var uniqueYears = {};
      var requests = [];

      months.forEach(function (month) {
        uniqueYears[month.year] = true;
      });

      Object.keys(uniqueYears).forEach(function (yearKey) {
        var year = parseInt(yearKey, 10);
        requests.push(ensureStateYear(year));
        if (holidayLoader) {
          requests.push(ensureHolidayYear(year));
        }
      });

      await Promise.all(requests);
    }

    function getHolidayName(dateStr) {
      var year = parseInt(dateStr.slice(0, 4), 10);
      return holidayCache[year] && holidayCache[year][dateStr]
        ? holidayCache[year][dateStr]
        : '';
    }

    function getStatusForDate(dateStr) {
      var year = parseInt(dateStr.slice(0, 4), 10);
      return (stateCache[year] && stateCache[year][dateStr]) || 'free';
    }

    function summarizeVisibleMonths() {
      var summary = { free: 0, full: 0, totalVisible: 0 };

      getVisibleMonths().forEach(function (month) {
        monthDays(month.year, month.month).forEach(function (day) {
          var dateStr = ymd(month.year, month.month, day);
          if (dateStr < todayStr) {
            return;
          }

          summary.totalVisible += 1;
          if (getStatusForDate(dateStr) === 'full') {
            summary.full += 1;
          } else {
            summary.free += 1;
          }
        });
      });

      if (summaryEl) {
        updateElementText(summaryEl, summaryFormatter(summary, viewSpanMonths));
      }

      return summary;
    }

    function getMonthSummary(year, month) {
      var summary = { free: 0, full: 0 };
      monthDays(year, month).forEach(function (day) {
        var dateStr = ymd(year, month, day);
        if (dateStr < todayStr) {
          return;
        }

        if (getStatusForDate(dateStr) === 'full') {
          summary.full += 1;
        } else {
          summary.free += 1;
        }
      });
      return summary;
    }

    function createStateNode(status, isPast) {
      var node = document.createElement('span');
      var resolvedStatus = isPast ? 'past' : status;
      node.className = 'state-badge ' + resolvedStatus;
      node.textContent = statusText[resolvedStatus] || '';
      node.setAttribute('aria-label', statusText[resolvedStatus] || '');
      return node;
    }

    function buildDayCell(year, month, day, firstWeekday, dateStr) {
      var td = document.createElement('td');
      var dayEl = document.createElement('div');
      var header = document.createElement('div');
      var dateNumber = document.createElement('span');
      var holidayLabel = document.createElement('span');
      var stateNode;
      var holidayName = getHolidayName(dateStr);
      var isPast = dateStr < todayStr;
      var isToday = dateStr === todayStr;
      var isWeekend =
        new Date(year, month - 1, day).getDay() === 0 ||
        new Date(year, month - 1, day).getDay() === 6;
      var status = getStatusForDate(dateStr);

      td.dataset.date = dateStr;
      dayEl.className = 'calendar-day';
      if (isWeekend) dayEl.classList.add('weekend');
      if (isToday) dayEl.classList.add('today');
      if (isPast) dayEl.classList.add('past');
      if (isAdmin && !isPast) dayEl.classList.add('is-admin');

      header.className = 'calendar-day-header';

      dateNumber.className = 'date-number';
      dateNumber.textContent = String(day);
      header.appendChild(dateNumber);

      holidayLabel.className = 'holiday-label';
      holidayLabel.textContent = holidayName || '';
      header.appendChild(holidayLabel);
      dayEl.appendChild(header);

      if (isToday) {
        var todayBadge = document.createElement('span');
        todayBadge.className = 'today-badge';
        todayBadge.setAttribute('aria-label', '今天');
        dayEl.appendChild(todayBadge);
      }

      stateNode = createStateNode(status, isPast);
      dayEl.appendChild(stateNode);

      if (isAdmin && !isPast) {
        dayEl.addEventListener('click', function () {
          toggleDateStatus(dateStr).catch(function (error) {
            console.error(error);
          });
        });
      }

      td.appendChild(dayEl);
      return td;
    }

    function buildEmptyCell() {
      var td = document.createElement('td');
      var dayEl = document.createElement('div');
      dayEl.className = 'calendar-day empty';
      td.appendChild(dayEl);
      return td;
    }

    function renderMonth(month) {
      var year = month.year;
      var monthNumber = month.month;
      var card = document.createElement('section');
      var head = document.createElement('div');
      var title = document.createElement('h2');
      var table = document.createElement('table');
      var thead = document.createElement('thead');
      var tbody = document.createElement('tbody');
      var headRow = document.createElement('tr');
      var firstWeekday = new Date(year, monthNumber - 1, 1).getDay();
      var totalDays = new Date(year, monthNumber, 0).getDate();
      var dayCounter = 1;
      var rowIndex;
      var columnIndex;

      card.className = 'calendar-card';

      head.className = 'calendar-head';
      title.className = 'calendar-title';
      title.textContent = year + ' 年 ' + monthNumber + ' 月';
      head.appendChild(title);

      if (showMonthSummary) {
        var monthCounts = document.createElement('div');
        monthCounts.className = 'month-counts';
        monthCounts.textContent = monthSummaryFormatter(
          getMonthSummary(year, monthNumber)
        );
        head.appendChild(monthCounts);
      }

      card.appendChild(head);

      table.className = 'calendar-table';
      WEEKDAY_LABELS.forEach(function (label) {
        var th = document.createElement('th');
        th.scope = 'col';
        th.textContent = label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      for (rowIndex = 0; rowIndex < 6; rowIndex += 1) {
        var row = document.createElement('tr');
        for (columnIndex = 0; columnIndex < 7; columnIndex += 1) {
          if ((rowIndex === 0 && columnIndex < firstWeekday) || dayCounter > totalDays) {
            row.appendChild(buildEmptyCell());
            continue;
          }

          row.appendChild(
            buildDayCell(
              year,
              monthNumber,
              dayCounter,
              firstWeekday,
              ymd(year, monthNumber, dayCounter)
            )
          );
          dayCounter += 1;
        }
        tbody.appendChild(row);
      }

      table.appendChild(tbody);
      card.appendChild(table);
      return card;
    }

    function render() {
      var fragment = document.createDocumentFragment();

      calendarsContainer.innerHTML = '';
      getVisibleMonths().forEach(function (month) {
        fragment.appendChild(renderMonth(month));
      });
      calendarsContainer.appendChild(fragment);
      summarizeVisibleMonths();

      if (onRenderComplete) {
        onRenderComplete(api);
      }
    }

    async function reload() {
      updateElementText(lastSyncEl, '同步中');
      await ensureVisibleData();
      render();
      return api;
    }

    async function toggleDateStatus(dateStr) {
      var year = parseInt(dateStr.slice(0, 4), 10);
      var previous = getStatusForDate(dateStr);
      var next = previous === 'full' ? 'free' : 'full';
      var yearCache = stateCache[year] || {};
      var hadPrevious = Object.prototype.hasOwnProperty.call(yearCache, dateStr);

      stateCache[year] = yearCache;
      yearCache[dateStr] = next;
      render();
      updateElementText(lastSyncEl, '儲存中');

      try {
        var payload = await patch(year, (function () {
          var delta = {};
          delta[dateStr] = next;
          return delta;
        })());
        if (onStateUpdated) {
          onStateUpdated({
            date: dateStr,
            year: year,
            previous: previous,
            current: next,
            response: payload,
          });
        }
      } catch (error) {
        if (hadPrevious) {
          yearCache[dateStr] = previous;
        } else {
          delete yearCache[dateStr];
        }
        render();
        updateElementText(lastSyncEl, '更新失敗');
        alert('更新失敗，已還原剛剛的操作。');
      }
    }

    ensureMonthRange();

    var api = {
      cache: stateCache,
      todayStr: todayStr,
      ymd: ymd,
      monthDays: monthDays,
      getStartYM: function () {
        var start = getStartYM();
        return [start.year, start.month];
      },
      canShiftMonths: canShiftMonths,
      shiftMonths: shiftMonths,
      goToday: goToday,
      render: render,
      reload: reload,
      patch: patch,
    };

    return api;
  }

  global.RoomCalendar = {
    create: createCalendar,
    createHolidayLoader: createHolidayLoader,
  };
})(window);
