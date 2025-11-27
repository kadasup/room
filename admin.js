// admin.js
// 後台編輯房況

// ===== 必填常數（請確認是同一個 /exec）======
const API_BASE =
  'https://script.google.com/macros/s/AKfycbyX3WVu_DLrx0gRehHButc0fjsjqRuS23UAjOPZWhy9nOt-cYOxIgMCLUu-OcV1n15f8g/exec';
const ADMIN_TOKEN = '1234567890';
// =============================================

const elMonth = document.getElementById('startMonth');
const elCals = document.getElementById('calendars');
const elLast = document.getElementById('lastSync');

// 建立共用日曆核心
const adminCalendar = RoomCalendar.create({
  apiBase: API_BASE,
  adminToken: ADMIN_TOKEN,
  monthInput: elMonth,
  calendarsContainer: elCals,
  lastSyncEl: elLast,
  viewSpanMonths: 3,
  renderCell: ({
    y,
    m,
    day,
    dstr,
    isPast,
    isToday,
    state,
    td,
    cache,
    apiPatch,
    updateCounts,
  }) => {
    let inner = `<span class="dateNo">${day}</span>`;
    if (isToday) inner += `<span class="today-dot"></span>`;

    if (!isPast) {
      inner += `<span class="state ${
        state === 'full' ? 'full' : 'free'
      }">${state === 'full' ? '已滿' : '可售'}</span>`;
    }
    td.innerHTML = inner;

    // 未來日期：點擊切換「可售 / 已滿」
    if (!isPast && apiPatch) {
      td.addEventListener('click', async () => {
        const cur = (cache[y] && cache[y][dstr]) || 'free';
        const next = cur === 'full' ? 'free' : 'full';

        cache[y] = cache[y] || {};
        cache[y][dstr] = next;

        const s = td.querySelector('.state');
        if (s) {
          s.className =
            'state ' + (next === 'full' ? 'full' : 'free');
          s.textContent = next === 'full' ? '已滿' : '可售';
        }
        updateCounts();

        try {
          await apiPatch(y, { [dstr]: next });
        } catch (err) {
          alert(
            '寫入失敗：' +
              (err && err.message ? err.message : err)
          );
          cache[y][dstr] = cur;
          if (s) {
            s.className =
              'state ' + (cur === 'full' ? 'full' : 'free');
            s.textContent = cur === 'full' ? '已滿' : '可售';
          }
          updateCounts();
        }
      });
    }
  },
});

// 顯示 API URL
const apiSpan = document.getElementById('apiBase');
if (apiSpan) {
  apiSpan.textContent = API_BASE;
  apiSpan.addEventListener('click', () =>
    window.open(API_BASE, '_blank')
  );
}

// 抓目前起始月份的 3 個月（保留原本「讀取中…」按鈕狀態）
async function reloadNow() {
  const btn = document.getElementById('btnReload');
  const last = elLast;
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = '讀取中…';
    }
    if (last) last.textContent = '讀取中…';

    await adminCalendar.reload();

    if (last)
      last.textContent =
        '讀取於 ' + new Date().toLocaleString();
  } catch (err) {
    console.error(err);
    alert(
      '重新載入失敗：' +
        (err && err.message ? err.message : err)
    );
    if (last) last.textContent = '讀取失敗';
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '今天';
    }
  }
}

// 「今天」按鈕：跳回今天所在月份（限制在 min/max 內）再讀取
function goTodayAndReload() {
  adminCalendar.goToday();
  reloadNow();
}

// 位移月份 n（例如 +/-3 個月）再讀取
function shiftMonthsAndReload(n) {
  adminCalendar.shiftMonths(n);
  reloadNow();
}

// 事件綁定
document
  .getElementById('btnReload')
  .addEventListener('click', goTodayAndReload);
document
  .getElementById('btnPrev3')
  .addEventListener('click', () => shiftMonthsAndReload(-3));
document
  .getElementById('btnNext3')
  .addEventListener('click', () => shiftMonthsAndReload(3));

// 批次：將本月所有「未來的週六」設為已滿
document
  .getElementById('btnSetSatFull')
  .addEventListener('click', async () => {
    const [Y, M] = adminCalendar.getStartYM();
    const days = adminCalendar
      .monthDays(Y, M)
      .filter((d) => {
        const ds = adminCalendar.ymd(Y, M, d);
        return (
          new Date(Y, M - 1, d).getDay() === 6 &&
          ds >= adminCalendar.todayStr
        );
      });

    if (!days.length) {
      alert('本月週六（含今日以前）無可設定的日期');
      return;
    }

    const delta = {};
    days.forEach((d) => {
      delta[adminCalendar.ymd(Y, M, d)] = 'full';
    });

    const cache = adminCalendar.cache;
    cache[Y] = cache[Y] || {};
    Object.assign(cache[Y], delta);

    adminCalendar.render();

    if (adminCalendar.patch) {
      try {
        await adminCalendar.patch(Y, delta);
      } catch (e) {
        alert(
          '寫入失敗：' +
            (e && e.message ? e.message : e)
        );
      }
    }
  });

// 批次：將本月所有「今日（含）以後」設為可售
document
  .getElementById('btnSetAllFree')
  .addEventListener('click', async () => {
    const [Y, M] = adminCalendar.getStartYM();
    const delta = {};
    adminCalendar.monthDays(Y, M).forEach((d) => {
      const ds = adminCalendar.ymd(Y, M, d);
      if (ds >= adminCalendar.todayStr) {
        delta[ds] = 'free';
      }
    });

    if (Object.keys(delta).length === 0) {
      alert('本月（含今日以前）無可設定的日期');
      return;
    }

    const cache = adminCalendar.cache;
    cache[Y] = cache[Y] || {};
    Object.assign(cache[Y], delta);

    adminCalendar.render();

    if (adminCalendar.patch) {
      try {
        await adminCalendar.patch(Y, delta);
      } catch (e) {
        alert(
          '寫入失敗：' +
            (e && e.message ? e.message : e)
        );
      }
    }
  });

// 初始化：第一次載入畫面
(async function () {
  await reloadNow();
  elMonth.addEventListener('change', reloadNow);
})();
