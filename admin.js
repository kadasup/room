const API_BASE =
  'https://script.google.com/macros/s/AKfycbyX3WVu_DLrx0gRehHButc0fjsjqRuS23UAjOPZWhy9nOt-cYOxIgMCLUu-OcV1n15f8g/exec';
const ADMIN_TOKEN = '1234567890';
const ADMIN_SYNC_KEY = 'room-admin-sync';
const HOLIDAY_ALIASES = [
  ['中華民國開國紀念日', '元旦'],
  ['和平紀念日', '228'],
  ['兒童節及民族掃墓節', '兒童節'],
  ['民族掃墓節', '清明節'],
  ['端午節', '端午'],
  ['中秋節', '中秋'],
  ['國慶日', '國慶'],
  ['農曆除夕', '除夕'],
  ['春節', '春節'],
];

function normalizeHolidayName(name) {
  for (const [source, target] of HOLIDAY_ALIASES) {
    if (name.includes(source)) {
      return target;
    }
  }
  return name.replace(/\s+/g, '').slice(0, 8);
}

const loadTaiwanHolidaysForAdmin = RoomCalendar.createHolidayLoader({
  cachePrefix: 'room-holidays-',
  normalize: normalizeHolidayName,
});

function notifyPublicClients() {
  try {
    localStorage.setItem(
      ADMIN_SYNC_KEY,
      JSON.stringify({ updatedAt: Date.now() })
    );
  } catch (error) {
    // Ignore storage failures.
  }

  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel('room-calendar-sync');
    channel.postMessage('refresh-public');
    channel.close();
  }
}

const adminPage = {
  monthInput: document.getElementById('startMonth'),
  calendars: document.getElementById('calendars'),
  lastSync: document.getElementById('lastSync'),
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
  viewSpanMonths: 3,
  showMonthSummary: false,
  holidayLoader: loadTaiwanHolidaysForAdmin,
  onStateUpdated: () => {
    notifyPublicClients();
  },
});

function openMonthPicker(input) {
  if (!input) return;
  input.focus({ preventScroll: true });
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
    } catch (error) {
      // Ignore unsupported picker invocation.
    }
  }
}

function bindMonthFieldPicker(input) {
  if (!input) return;
  const field = input.closest('.field');
  if (!field) return;

  field.addEventListener('pointerdown', (event) => {
    if (event.target === input) return;
    event.preventDefault();
    openMonthPicker(input);
  });

  field.addEventListener('click', (event) => {
    if (event.target === input) return;
    openMonthPicker(input);
  });
}

function syncAdminNavState() {
  if (adminPage.btnPrev) {
    adminPage.btnPrev.disabled = !adminCalendar.canShiftMonths(-3);
  }
  if (adminPage.btnNext) {
    adminPage.btnNext.disabled = !adminCalendar.canShiftMonths(3);
  }
}

async function reloadAdminCalendar(options = {}) {
  const { goToday = false } = options;

  try {
    adminPage.btnReload.disabled = true;
    adminPage.btnReload.textContent = '同步中';

    if (goToday) {
      adminCalendar.goToday();
    }

    syncAdminNavState();
    await adminCalendar.reload();
  } catch (error) {
    console.error(error);
    alert('重新載入失敗，請確認 GAS 是否可正常連線。');
    adminPage.lastSync.textContent = '同步失敗';
  } finally {
    adminPage.btnReload.disabled = false;
    adminPage.btnReload.textContent = '回到本月';
    syncAdminNavState();
  }
}

async function patchMonth(delta, successText) {
  const [year] = adminCalendar.getStartYM();
  const yearCache = adminCalendar.cache[year] || {};
  const rollback = {};
  const existed = {};

  adminCalendar.cache[year] = yearCache;
  Object.keys(delta).forEach((dateStr) => {
    existed[dateStr] = Object.prototype.hasOwnProperty.call(yearCache, dateStr);
    rollback[dateStr] = yearCache[dateStr] || 'free';
    yearCache[dateStr] = delta[dateStr];
  });
  adminCalendar.render();

  try {
    await adminCalendar.patch(year, delta);
    adminPage.lastSync.textContent = successText;
    notifyPublicClients();
    await adminCalendar.reload();
    syncAdminNavState();
  } catch (error) {
    console.error(error);
    Object.keys(rollback).forEach((dateStr) => {
      if (existed[dateStr]) {
        yearCache[dateStr] = rollback[dateStr];
      } else {
        delete yearCache[dateStr];
      }
    });
    adminCalendar.render();
    alert('批次更新失敗，已還原剛剛的變更。');
    await reloadAdminCalendar();
  }
}

adminPage.btnReload.addEventListener('click', () =>
  reloadAdminCalendar({ goToday: true })
);

adminPage.btnPrev.addEventListener('click', () => {
  if (!adminCalendar.canShiftMonths(-3)) return;
  adminCalendar.shiftMonths(-3);
  syncAdminNavState();
  reloadAdminCalendar();
});

adminPage.btnNext.addEventListener('click', () => {
  if (!adminCalendar.canShiftMonths(3)) return;
  adminCalendar.shiftMonths(3);
  syncAdminNavState();
  reloadAdminCalendar();
});

bindMonthFieldPicker(adminPage.monthInput);

adminPage.monthInput.addEventListener('change', () => {
  syncAdminNavState();
  reloadAdminCalendar();
});

adminPage.btnSetSatFull.addEventListener('click', async () => {
  const [year, month] = adminCalendar.getStartYM();
  const delta = {};

  adminCalendar.monthDays(year, month).forEach((day) => {
    const dateStr = adminCalendar.ymd(year, month, day);
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday === 6 && dateStr >= adminCalendar.todayStr) {
      delta[dateStr] = 'full';
    }
  });

  if (Object.keys(delta).length === 0) {
    alert('這個月份沒有可更新的未來星期六。');
    return;
  }

  await patchMonth(delta, '本月星期六已設為客滿');
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
    alert('這個月份沒有可恢復的未來日期。');
    return;
  }

  await patchMonth(delta, '本月未來日期已恢復可安排');
});

syncAdminNavState();
reloadAdminCalendar({ goToday: true });
