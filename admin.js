const API_BASE =
  'https://script.google.com/macros/s/AKfycbyX3WVu_DLrx0gRehHButc0fjsjqRuS23UAjOPZWhy9nOt-cYOxIgMCLUu-OcV1n15f8g/exec';
const ADMIN_TOKEN = '1234567890';

async function loadTaiwanHolidaysForAdmin(year) {
  const url = `https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`holiday fetch failed: ${res.status}`);
  }
  const list = await res.json();
  const out = {};
  list.forEach((item) => {
    if (!item.isHoliday || !item.description) return;
    const d = item.date;
    out[`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`] =
      item.description.replace(/\s+/g, '').slice(0, 8);
  });
  return out;
}

const adminPage = {
  monthInput: document.getElementById('startMonth'),
  calendars: document.getElementById('calendars'),
  lastSync: document.getElementById('lastSync'),
  summary: document.getElementById('summaryText'),
  btnPrev: document.getElementById('btnPrev3'),
  btnNext: document.getElementById('btnNext3'),
  btnReload: document.getElementById('btnReload'),
  btnSetSatFull: document.getElementById('btnSetSatFull'),
  btnSetAllFree: document.getElementById('btnSetAllFree'),
};

const adminCalendar = RoomCalendar.create({
  apiBase: API_BASE,
  adminToken: ADMIN_TOKEN,
  monthInput: adminPage.monthInput,
  calendarsContainer: adminPage.calendars,
  lastSyncEl: adminPage.lastSync,
  summaryEl: adminPage.summary,
  viewSpanMonths: 3,
  holidayLoader: loadTaiwanHolidaysForAdmin,
});

async function reloadAdminCalendar({ goToday = false } = {}) {
  try {
    adminPage.btnReload.disabled = true;
    adminPage.btnReload.textContent = '同步中...';
    if (goToday) {
      adminCalendar.goToday();
    }
    await adminCalendar.reload();
  } catch (error) {
    console.error(error);
    alert('同步失敗，請檢查 GAS 或稍後再試。');
    adminPage.lastSync.textContent = '同步失敗';
  } finally {
    adminPage.btnReload.disabled = false;
    adminPage.btnReload.textContent = '同步最新';
  }
}

async function patchMonth(delta, successText) {
  const [year] = adminCalendar.getStartYM();
  const cache = adminCalendar.cache;
  cache[year] = cache[year] || {};
  Object.assign(cache[year], delta);
  adminCalendar.render();

  try {
    await adminCalendar.patch(year, delta);
    adminPage.lastSync.textContent = successText;
    await adminCalendar.reload();
  } catch (error) {
    console.error(error);
    alert('批次更新失敗，畫面將重新整理。');
    await reloadAdminCalendar();
  }
}

adminPage.btnReload.addEventListener('click', () =>
  reloadAdminCalendar({ goToday: true })
);
adminPage.btnPrev.addEventListener('click', () => {
  adminCalendar.shiftMonths(-3);
  reloadAdminCalendar();
});
adminPage.btnNext.addEventListener('click', () => {
  adminCalendar.shiftMonths(3);
  reloadAdminCalendar();
});
adminPage.monthInput.addEventListener('change', () => reloadAdminCalendar());

adminPage.btnSetSatFull.addEventListener('click', async () => {
  const [year, month] = adminCalendar.getStartYM();
  const delta = {};

  adminCalendar.monthDays(year, month).forEach((day) => {
    const dateStr = adminCalendar.ymd(year, month, day);
    if (
      new Date(year, month - 1, day).getDay() === 6 &&
      dateStr >= adminCalendar.todayStr
    ) {
      delta[dateStr] = 'full';
    }
  });

  if (Object.keys(delta).length === 0) {
    alert('這個月份沒有可更新的未來星期六。');
    return;
  }

  await patchMonth(delta, '已將本月未來星期六設為客滿');
});

adminPage.btnSetAllFree.addEventListener('click', async () => {
  const [year, month] = adminCalendar.getStartYM();
  const delta = {};

  adminCalendar.monthDays(year, month).forEach((day) => {
    const dateStr = adminCalendar.ymd(year, month, day);
    if (dateStr >= adminCalendar.todayStr) {
      delta[dateStr] = 'free';
    }
  });

  if (Object.keys(delta).length === 0) {
    alert('這個月份沒有可重設的未來日期。');
    return;
  }

  await patchMonth(delta, '已將本月未來日期重設為可預約');
});

reloadAdminCalendar({ goToday: true });
