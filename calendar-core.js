// calendar-core.js
// 共用日曆核心：快取、API 呼叫、渲染 3 個月

(function (global) {
  'use strict';

  function createCalendar(options) {
    if (!options) {
      throw new Error('RoomCalendar.create: options is required');
    }

    var API_BASE = options.apiBase;
    if (!API_BASE) {
      throw new Error('RoomCalendar.create: apiBase is required');
    }

    var ADMIN_TOKEN = options.adminToken || null;
    var elMonth = options.monthInput;
    var elCals = options.calendarsContainer;
    var elLastSync = options.lastSyncEl || null;
    var viewSpan = options.viewSpanMonths || 3;
    var renderCell =
      typeof options.renderCell === 'function' ? options.renderCell : null;

    if (!elMonth || !elCals) {
      throw new Error(
        'RoomCalendar.create: monthInput & calendarsContainer are required'
      );
    }

    // { [yearNumber]: { 'YYYY-MM-DD': 'full' | 'free' } }
    var CACHE = {};

    // 工具
    function fmt(d) {
      return d.toISOString().slice(0, 10);
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
    var todayStr = fmt(new Date());

    function isWeekend(y, m, day) {
      var wd = new Date(y, m - 1, day).getDay();
      return wd === 0 || wd === 6;
    }

    function monthDays(y, m) {
      var last = new Date(y, m, 0).getDate();
      var out = new Array(last);
      for (var i = 0; i < last; i++) {
        out[i] = i + 1;
      }
      return out;
    }

    // ===== API GET（防快取）=====
    async function apiGet(year) {
      var u = new URL(API_BASE);
      u.searchParams.set('year', String(year));
      u.searchParams.set('t', Date.now().toString());
      var res = await fetch(u.toString(), {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('GET failed ' + res.status);
      }
      var json = await res.json();
      CACHE[year] = (json && json.status) || {};
      if (elLastSync) {
        elLastSync.textContent = '讀取於 ' + new Date().toLocaleString();
      }
      return json;
    }

    // ===== API POST（FormData 避免預檢）=====
    async function apiPatch(year, delta) {
      if (!ADMIN_TOKEN) {
        throw new Error('No admin token configured');
      }
      var fd = new FormData();
      fd.append('token', ADMIN_TOKEN);
      fd.append('year', String(year));
      fd.append('delta', JSON.stringify(delta));
      var res = await fetch(API_BASE, {
        method: 'POST',
        body: fd,
        redirect: 'follow',
      });
      if (!res.ok) {
        throw new Error('POST failed ' + res.status);
      }
      var out = await res.json();
      if (out && out.data && out.data.status) {
        CACHE[year] = out.data.status;
      }
      if (elLastSync) {
        elLastSync.textContent = '已寫入於 ' + new Date().toLocaleString();
      }
      return out;
    }

    // ===== 設定 month input 的 min / max（本月起算近兩年）=====
    function initSelectors() {
      var now = new Date();
      var curYear = now.getFullYear();

      // 最小：本月
      var minMonth =
        curYear + '-' + String(now.getMonth() + 1).padStart(2, '0');
      elMonth.min = minMonth;

      // 最大：本月起 24 個月內
      var maxDate = new Date(now.getFullYear(), now.getMonth() + 23, 1);
      var maxMonth =
        maxDate.getFullYear() +
        '-' +
        String(maxDate.getMonth() + 1).padStart(2, '0');
      elMonth.max = maxMonth;

      if (!elMonth.value) {
        elMonth.value = minMonth;
      }
    }

    // 只抓畫面會用到且尚未在快取的年份
    async function ensureYearsLoadedForView() {
      var parts = elMonth.value.split('-');
      var Y = parseInt(parts[0], 10);
      var M = parseInt(parts[1], 10);

      var years = {};
      for (var k = 0; k < viewSpan; k++) {
        var y = Y;
        var m = M + k;
        if (m > 12) {
          y += Math.floor((m - 1) / 12);
          m = ((m - 1) % 12) + 1;
        }
        years[y] = true;
      }

      var tasks = [];
      Object.keys(years).forEach(function (ys) {
        var ynum = parseInt(ys, 10);
        if (!CACHE[ynum]) {
          tasks.push(apiGet(ynum));
        }
      });

      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
    }

    function updateCounts(y, m) {
      var daysArr = monthDays(y, m);
      var full = 0;
      var free = 0;
      daysArr.forEach(function (d) {
        var dstr = ymd(y, m, d);
        if (dstr < todayStr) {
          return;
        }
        var st = (CACHE[y] && CACHE[y][dstr]) || 'free';
        if (st === 'full') {
          full += 1;
        } else {
          free += 1;
        }
      });
      var el = document.getElementById('cnt-' + y + '-' + m);
      if (el) {
        el.textContent =
          '可售 ' +
          String(free).padStart(2, '0') +
          ' • 已滿 ' +
          String(full).padStart(2, '0');
      }
    }

    function renderCalendars() {
      var parts = elMonth.value.split('-');
      var Y = parseInt(parts[0], 10);
      var M = parseInt(parts[1], 10);

      var minParts = elMonth.min.split('-');
      var minY = parseInt(minParts[0], 10);
      var minM = parseInt(minParts[1], 10);
      var maxParts = elMonth.max.split('-');
      var maxY = parseInt(maxParts[0], 10);
      var maxM = parseInt(maxParts[1], 10);

      // clamp 在 min / max 裡面
      if (Y < minY || (Y === minY && M < minM)) {
        Y = minY;
        M = minM;
        elMonth.value =
          Y + '-' + String(M).padStart(2, '0');
      } else if (Y > maxY || (Y === maxY && M > maxM)) {
        Y = maxY;
        M = maxM;
        elMonth.value =
          Y + '-' + String(M).padStart(2, '0');
      }

      var months = [];
      for (var k = 0; k < viewSpan; k++) {
        var y = Y;
        var m = M + k;
        if (m > 12) {
          y += Math.floor((m - 1) / 12);
          m = ((m - 1) % 12) + 1;
        }
        months.push({ y: y, m: m });
      }

      elCals.innerHTML = '';

      months.forEach(function (mm) {
        var y = mm.y;
        var m = mm.m;

        var cal = document.createElement('div');
        cal.className = 'calendar';

        var head = document.createElement('div');
        head.className = 'cal-head';
        head.innerHTML =
          '<div class="cal-title">' +
          y +
          ' 年 ' +
          m +
          ' 月</div><div class="counts" id="cnt-' +
          y +
          '-' +
          m +
          '"></div>';
        cal.appendChild(head);

        var table = document.createElement('table');

        var thead = document.createElement('thead');
        thead.innerHTML =
          '<tr>' +
          '<th>日</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th>六</th>' +
          '</tr>';
        table.appendChild(thead);

        var tbody = document.createElement('tbody');
        var firstWd = new Date(y, m - 1, 1).getDay();
        var daysArr = monthDays(y, m);
        var row = document.createElement('tr');

        for (var i = 0; i < firstWd; i++) {
          row.appendChild(document.createElement('td'));
        }

        daysArr.forEach(function (day) {
          var td = document.createElement('td');
          var dstr = ymd(y, m, day);
          var isPast = dstr < todayStr;
          var isToday = dstr === todayStr;
          var cls = 'day';
          if (isWeekend(y, m, day)) {
            cls += ' weekend';
          }
          if (isToday) {
            cls += ' is-today';
          }
          if (isPast) {
            cls += ' past muted';
          }
          td.className = cls;

          var state = (CACHE[y] && CACHE[y][dstr]) || 'free';

          if (renderCell) {
            renderCell({
              y: y,
              m: m,
              day: day,
              dstr: dstr,
              isPast: isPast,
              isToday: isToday,
              state: state,
              td: td,
              todayStr: todayStr,
              cache: CACHE,
              apiPatch: ADMIN_TOKEN ? apiPatch : null,
              updateCounts: function () {
                updateCounts(y, m);
              },
            });
          }

          row.appendChild(td);
          if ((firstWd + day) % 7 === 0) {
            tbody.appendChild(row);
            row = document.createElement('tr');
          }
        });

        if (row.children.length > 0) {
          tbody.appendChild(row);
        }

        table.appendChild(tbody);
        cal.appendChild(table);
        elCals.appendChild(cal);

        updateCounts(y, m);
      });
    }

    async function loadYearAndRender() {
      await ensureYearsLoadedForView();
      renderCalendars();
    }

    // 初始化 min/max
    initSelectors();

    // 對外 API
    return {
      // 抓資料 + 渲染
      reload: loadYearAndRender,

      // 將起始月份設為今天所在月份（受 min/max 限制）
      goToday: function () {
        var now = new Date();
        var Y = now.getFullYear();
        var M = now.getMonth() + 1;

        var minParts = elMonth.min.split('-');
        var minY = parseInt(minParts[0], 10);
        var minM = parseInt(minParts[1], 10);
        var maxParts = elMonth.max.split('-');
        var maxY = parseInt(maxParts[0], 10);
        var maxM = parseInt(maxParts[1], 10);

        if (Y < minY || (Y === minY && M < minM)) {
          Y = minY;
          M = minM;
        } else if (Y > maxY || (Y === maxY && M > maxM)) {
          Y = maxY;
          M = maxM;
        }

        elMonth.value =
          Y + '-' + String(M).padStart(2, '0');
      },

      // 以目前起始月份為基準，平移 n 個月
      shiftMonths: function (n) {
        var minParts = elMonth.min.split('-');
        var minY = parseInt(minParts[0], 10);
        var minM = parseInt(minParts[1], 10);
        var maxParts = elMonth.max.split('-');
        var maxY = parseInt(maxParts[0], 10);
        var maxM = parseInt(maxParts[1], 10);

        var minDate = new Date(minY, minM - 1, 1);
        var maxDate = new Date(maxY, maxM - 1, 1);

        var curParts = elMonth.value.split('-');
        var Y = parseInt(curParts[0], 10);
        var M = parseInt(curParts[1], 10);
        var base = new Date(Y, M - 1, 1);
        base.setMonth(base.getMonth() + n);

        if (base < minDate) {
          base = minDate;
        }
        if (base > maxDate) {
          base = maxDate;
        }

        elMonth.value =
          base.getFullYear() +
          '-' +
          String(base.getMonth() + 1).padStart(2, '0');
      },

      // 目前起始年月（給後台批次用）
      getStartYM: function () {
        var parts = elMonth.value.split('-');
        var Y = parseInt(parts[0], 10);
        var M = parseInt(parts[1], 10);
        return [Y, M];
      },

      monthDays: monthDays,
      ymd: ymd,
      todayStr: todayStr,

      get cache() {
        return CACHE;
      },

      patch: ADMIN_TOKEN ? apiPatch : null,

      // 只重畫，不重抓（給批次功能用）
      render: renderCalendars,
    };
  }

  global.RoomCalendar = { create: createCalendar };
})(window);
