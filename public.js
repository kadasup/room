const API_BASE_PUBLIC =
  'https://script.google.com/macros/s/AKfycbyX3WVu_DLrx0gRehHButc0fjsjqRuS23UAjOPZWhy9nOt-cYOxIgMCLUu-OcV1n15f8g/exec';

const ADMIN_SYNC_KEY = 'room-admin-sync';
const PUBLIC_REFRESH_MS = 60 * 1000;
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

const loadTaiwanHolidays = RoomCalendar.createHolidayLoader({
  cachePrefix: 'room-holidays-',
  normalize: normalizeHolidayName,
});

const publicPage = {
  monthInput: document.getElementById('startMonth'),
  calendars: document.getElementById('calendars'),
  lastSync: document.getElementById('lastSync'),
  btnPrev: document.getElementById('btnPrev3'),
  btnNext: document.getElementById('btnNext3'),
  btnReload: document.getElementById('btnReload'),
  btnTop: document.getElementById('btnTop'),
};

const publicCalendar = RoomCalendar.create({
  apiBase: API_BASE_PUBLIC,
  monthInput: publicPage.monthInput,
  calendarsContainer: publicPage.calendars,
  lastSyncEl: publicPage.lastSync,
  viewSpanMonths: 3,
  showMonthSummary: false,
  holidayLoader: loadTaiwanHolidays,
});

let isReloadingPublic = false;

function syncPublicNavState() {
  if (publicPage.btnPrev) {
    publicPage.btnPrev.disabled = !publicCalendar.canShiftMonths(-3);
  }
  if (publicPage.btnNext) {
    publicPage.btnNext.disabled = !publicCalendar.canShiftMonths(3);
  }
}

async function reloadPublicCalendar(options = {}) {
  const { goToday = false, silent = false } = options;
  if (isReloadingPublic) return;

  isReloadingPublic = true;

  try {
    if (goToday) {
      publicCalendar.goToday();
    }

    if (!silent && publicPage.btnReload) {
      publicPage.btnReload.disabled = true;
      publicPage.btnReload.textContent = '同步中';
    }

    syncPublicNavState();
    await publicCalendar.reload();
  } catch (error) {
    console.error(error);
    if (!silent) {
      alert('重新載入失敗，請稍後再試。');
    }
    if (publicPage.lastSync) {
      publicPage.lastSync.textContent = '同步失敗';
    }
  } finally {
    if (!silent && publicPage.btnReload) {
      publicPage.btnReload.disabled = false;
      publicPage.btnReload.textContent = '回到本月';
    }
    syncPublicNavState();
    isReloadingPublic = false;
  }
}

publicPage.btnReload.addEventListener('click', () =>
  reloadPublicCalendar({ goToday: true })
);

publicPage.btnPrev.addEventListener('click', () => {
  if (!publicCalendar.canShiftMonths(-3)) return;
  publicCalendar.shiftMonths(-3);
  syncPublicNavState();
  reloadPublicCalendar();
});

publicPage.btnNext.addEventListener('click', () => {
  if (!publicCalendar.canShiftMonths(3)) return;
  publicCalendar.shiftMonths(3);
  syncPublicNavState();
  reloadPublicCalendar();
});

publicPage.monthInput.addEventListener('change', () => {
  syncPublicNavState();
  reloadPublicCalendar();
});

window.addEventListener('scroll', () => {
  if (!publicPage.btnTop) return;
  publicPage.btnTop.classList.toggle('show', window.scrollY > 280);
});

if (publicPage.btnTop) {
  publicPage.btnTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

window.addEventListener('storage', (event) => {
  if (event.key !== ADMIN_SYNC_KEY || !event.newValue) return;
  reloadPublicCalendar({ silent: true });
});

if ('BroadcastChannel' in window) {
  const channel = new BroadcastChannel('room-calendar-sync');
  channel.addEventListener('message', (event) => {
    if (event.data === 'refresh-public') {
      reloadPublicCalendar({ silent: true });
    }
  });
}

setInterval(() => {
  if (document.visibilityState === 'visible') {
    reloadPublicCalendar({ silent: true });
  }
}, PUBLIC_REFRESH_MS);

syncPublicNavState();
reloadPublicCalendar({ goToday: true });
