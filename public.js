// public.js
// 前台（客人查詢用）唯讀日曆

// ===== 常數（請確認與後台使用同一個 /exec）======
const API_BASE_PUBLIC =
  'https://script.google.com/macros/s/AKfycbyX3WVu_DLrx0gRehHButc0fjsjqRuS23UAjOPZWhy9nOt-cYOxIgMCLUu-OcV1n15f8g/exec';
// =============================================

// 主要 DOM
const elMonthPub = document.getElementById('startMonth');
const elCalsPub = document.getElementById('calendars');
const elLastPub = document.getElementById('lastSync');

// 電話號碼：優先讀 body data-phone，其次 fallback 固定號碼
const PHONE =
  document.body.dataset.phone || '0905385388';

// 建立共用日曆核心（唯讀）
const publicCalendar = RoomCalendar.create({
  apiBase: API_BASE_PUBLIC,
  monthInput: elMonthPub,
  calendarsContainer: elCalsPub,
  lastSyncEl: elLastPub,
  viewSpanMonths: 3,
  renderCell: ({
    day,
    dstr,
    isPast,
    isToday,
    state,
    td,
  }) => {
    let inner = `<span class="dateNo">${day}</span>`;
    if (isToday) inner += `<span class="today-dot"></span>`;

    if (!isPast) {
      if (state === 'full') {
        inner += `<span class="state full">已滿</span>`;
      } else {
        inner += `<a href="tel:${PHONE}" class="call-link"><span class="state free">可售</span></a>`;
      }
    }
    td.innerHTML = inner;
  },
});

// 顯示 API URL
const apiSpanPub = document.getElementById('apiBase');
if (apiSpanPub) {
  apiSpanPub.textContent = API_BASE_PUBLIC;
  apiSpanPub.addEventListener('click', () =>
    window.open(API_BASE_PUBLIC, '_blank')
  );
}

// 抓目前起始月份的 3 個月（保留原本「讀取中…」按鈕狀態）
async function reloadNowPub() {
  const btn = document.getElementById('btnReload');
  const last = elLastPub;
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = '讀取中…';
    }
    if (last) last.textContent = '讀取中…';

    await publicCalendar.reload();

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
function goTodayAndReloadPub() {
  publicCalendar.goToday();
  reloadNowPub();
}

// 位移月份 n（例如 +/-3 個月）再讀取
function shiftMonthsAndReloadPub(n) {
  publicCalendar.shiftMonths(n);
  reloadNowPub();
}

// 事件綁定
document
  .getElementById('btnReload')
  .addEventListener('click', goTodayAndReloadPub);
document
  .getElementById('btnPrev3')
  .addEventListener('click', () =>
    shiftMonthsAndReloadPub(-3)
  );
document
  .getElementById('btnNext3')
  .addEventListener('click', () =>
    shiftMonthsAndReloadPub(3)
  );

// 初始化：第一次載入畫面
(async function () {
  await reloadNowPub();
  elMonthPub.addEventListener('change', reloadNowPub);
})();
