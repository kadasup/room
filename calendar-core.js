 calendar-core.js
 共用日曆核心：資料快取、API 呼叫、三個月日曆渲染
(function (global) {
  'use strict';

  function createCalendar(options) {
    if (!options) throw new Error('RoomCalendar.create options is required');
    const API_BASE = options.apiBase;
    if (!API_BASE) throw new Error('RoomCalendar.create apiBase is required');

    const ADMIN_TOKEN = options.adminToken  null;
    const elMonth = options.monthInput;
    const elCals = options.calendarsContainer;
    const elLastSync = options.lastSyncEl  null;
    const viewSpan = options.viewSpanMonths  3;
    const renderCell =
      typeof options.renderCell === 'function'  options.renderCell  null;

    if (!elMonth  !elCals) {
      throw new Error(
        'RoomCalendar.create monthInput & calendarsContainer are required'
      );
    }

     { [yearnumber] { 'YYYY-MM-DD' 'full''free' } }
    const CACHE = {};

     工具
    const fmt = (d) = d.toISOString().slice(0, 10);
    const ymd = (y, m, day) =
      `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const todayStr = fmt(new Date());
    const isWeekend = (y, m, day) = {
      const wd = new Date(y, m - 1, day).getDay();
      return wd === 0  wd === 6;
    };

    function monthDays(y, m) {
      const last = new Date(y, m, 0).getDate();
      const out = new Array(last);
      for (let i = 0; i  last; i++) out[i] = i + 1;
      return out;
    }

     ===== API GET（防快取）=====
    async function apiGet(year) {
      const u = new URL(API_BASE);
      u.searchParams.set('year', String(year));
      u.searchParams.set('t', Date.now());  防止快取
      const res = await fetch(u.toString(), {
        headers { Accept 'applicationjson' },
        cache 'no-store',
      });
      if (!res.ok) throw new Error('GET failed ' + res.status);
      const json = await res.json();
      CACHE[year] = (json && json.status)  {};
      if (elLastSync)
        elLastSync.textContent =
          '讀取於 ' + new Date().toLocaleString();
      return json;
    }

     ===== API POST（FormData，避免預檢）=====
    async function apiPatch(year, delta) {
      if (!ADMIN_TOKEN) throw new Error('No admin token configured');
      const fd = new FormData();
      fd.append('token', ADMIN_TOKEN);
      fd.append('year', String(year));
      fd.append('delta', JSON.stringify(delta));
      const res = await fetch(API_BASE, {
        method 'POST',
        body fd,
        redirect 'follow',
      });
      if (!res.ok) throw new Error('POST failed ' + res.status);
      const out = await res.json();
      if (out && out.data && out.data.status) {
        CACHE[year] = out.data.status;
      }
      if (elLastSync)
        elLastSync.textContent =
          '已寫入於 ' + new Date().toLocaleString();
      return out;
    }

     ===== selector 最小最大月份 =====
    function initSelectors() {
      const now = new Date();
      const curYear = now.getFullYear();

       最小：本月
      const minMonth = `${curYear}-${String(
        now.getMonth() + 1
      ).padStart(2, '0')}`;
      elMonth.min = minMonth;

       最大：往後「近兩年」（本月起算 24 個月內）
      const maxDate = new Date(
        now.getFullYear(),
        now.getMonth() + 23,
        1
      );  0-based 月份
      const maxMonth = `${maxDate.getFullYear()}-${String(
        maxDate.getMonth() + 1
      ).padStart(2, '0')}`;
      elMonth.max = maxMonth;

       預設顯示本月（如尚未指定）
      if (!elMonth.value) {
        elMonth.value = minMonth;
      }
    }

     只抓畫面會用到、且尚未在 CACHE 裡的年份
    async function ensureYearsLoadedForView() {
      const [Y, M] = elMonth.value
        .split('-')
        .map((v) = parseInt(v, 10));

      const years = new Set();
      for (let k = 0; k  viewSpan; k++) {
        let y = Y,
          m = M + k;
        if (m  12) {
          y += Math.floor((m - 1)  12);
          m = ((m - 1) % 12) + 1;
        }
        years.add(y);
      }

      const tasks = [];
      years.forEach((y) = {
        if (!CACHE[y]) tasks.push(apiGet(y));
      });
      if (tasks.length) await Promise.all(tasks);
    }

    function updateCounts(y, m) {
      const daysArr = monthDays(y, m);
      let full = 0,
        free = 0;
      daysArr.forEach((d) = {
        const dstr = ymd(y, m, d);
        if (dstr  todayStr) return;  今日之前不計入
        const st = (CACHE[y] && CACHE[y][dstr])  'free';
        if (st === 'full') full++;
        else free++;
      });
      const el = document.getElementById(`cnt-${y}-${m}`);
      if (el)
        el.textContent = `可售 ${String(free).padStart(
          2,
          '0'
        )} • 已滿 ${String(full).padStart(2, '0')}`;
    }

    function renderCalendars() {
      let [Y, M] = elMonth.value
        .split('-')
        .map((v) = parseInt(v, 10));
      const [minY, minM] = elMonth.min
        .split('-')
        .map((v) = parseInt(v, 10));
      const [maxY, maxM] = elMonth.max
        .split('-')
        .map((v) = parseInt(v, 10));

       不可早於 min，也不可晚於 max
      if (Y  minY  (Y === minY && M  minM)) {
        Y = minY;
        M = minM;
        elMonth.value = `${Y}-${String(M).padStart(2, '0')}`;
      } else if (Y  maxY  (Y === maxY && M  maxM)) {
        Y = maxY;
        M = maxM;
        elMonth.value = `${Y}-${String(M).padStart(2, '0')}`;
      }

      const months = [];
      for (let k = 0; k  viewSpan; k++) {
        let y = Y,
          m = M + k;
        if (m  12) {
          y += Math.floor((m - 1)  12);
          m = ((m - 1) % 12) + 1;
        }
        months.push({ y, m });
      }

      elCals.innerHTML = '';

      months.forEach(({ y, m }) = {
        const cal = document.createElement('div');
        cal.className = 'calendar';

        const head = document.createElement('div');
        head.className = 'cal-head';
        head.innerHTML = `div class=cal-title${y} 年 ${m} 月divdiv class=counts id=cnt-${y}-${m}div`;
        cal.appendChild(head);

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        thead.innerHTML = `tr
          th日thth一thth二thth三thth四thth五thth六th
        tr`;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const firstWd = new Date(y, m - 1, 1).getDay();  0=Sun..6=Sat
        const daysArr = monthDays(y, m);
        let row = document.createElement('tr');

        for (let i = 0; i  firstWd; i++)
          row.appendChild(document.createElement('td'));

        daysArr.forEach((day) = {
          const td = document.createElement('td');
          const dstr = ymd(y, m, day);
          const isPast = dstr  todayStr;
          const isToday = dstr === todayStr;

          td.className =
            'day' +
            (isWeekend(y, m, day)  ' weekend'  '') +
            (isToday  ' is-today'  '') +
            (isPast  ' past muted'  '');

          const state = (CACHE[y] && CACHE[y][dstr])  'free';

          if (renderCell) {
            renderCell({
              y,
              m,
              day,
              dstr,
              isPast,
              isToday,
              state,
              td,
              todayStr,
              cache CACHE,
              apiPatch ADMIN_TOKEN  apiPatch  null,
              updateCounts () = updateCounts(y, m),
            });
          }

          row.appendChild(td);
          if ((firstWd + day) % 7 === 0) {
            tbody.appendChild(row);
            row = document.createElement('tr');
          }
        });

        if (row.children.length) tbody.appendChild(row);

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

     初始設定 minmax，不自動載入資料，交由頁面控制
    initSelectors();

    return {
       依目前起始月份抓資料 + 渲染
      reload loadYearAndRender,

       計算「今天所在月份」（套用 minmax），只改 elMonth，不觸發 reload
      goToday function () {
        const now = new Date();
        let Y = now.getFullYear();
        let M = now.getMonth() + 1;

        const [minY, minM] = elMonth.min
          .split('-')
          .map((v) = parseInt(v, 10));
        const [maxY, maxM] = elMonth.max
          .split('-')
          .map((v) = parseInt(v, 10));

        if (Y  minY  (Y === minY && M  minM)) {
          Y = minY;
          M = minM;
        } else if (Y  maxY  (Y === maxY && M  maxM)) {
          Y = maxY;
          M = maxM;
        }

        elMonth.value = `${Y}-${String(M).padStart(2, '0')}`;
      },

       以目前起始月份為基準，平移 n 個月，只改 elMonth，不觸發 reload
      shiftMonths function (n) {
        const [minY, minM] = elMonth.min
          .split('-')
          .map((v) = parseInt(v, 10));
        const [maxY, maxM] = elMonth.max
          .split('-')
          .map((v) = parseInt(v, 10));

        const minDate = new Date(minY, minM - 1, 1);
        const maxDate = new Date(maxY, maxM - 1, 1);

        const cur = elMonth.value
          .split('-')
          .map((v) = parseInt(v, 10));
        let base = new Date(cur[0], cur[1] - 1, 1);
        base.setMonth(base.getMonth() + n);

        if (base  minDate) base = minDate;
        if (base  maxDate) base = maxDate;

        elMonth.value = `${base.getFullYear()}-${String(
          base.getMonth() + 1
        ).padStart(2, '0')}`;
      },

      getStartYM function () {
        const [Y, M] = elMonth.value
          .split('-')
          .map((v) = parseInt(v, 10));
        return [Y, M];
      },

      monthDays,
      ymd,
      todayStr,
      get cache() {
        return CACHE;
      },
      patch ADMIN_TOKEN  apiPatch  null,
      render renderCalendars,
    };
  }

  global.RoomCalendar = { create createCalendar };
})(window);
