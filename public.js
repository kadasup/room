const API_BASE_PUBLIC =
  'https://script.google.com/macros/s/AKfycbyX3WVu_DLrx0gRehHButc0fjsjqRuS23UAjOPZWhy9nOt-cYOxIgMCLUu-OcV1n15f8g/exec';

const ADMIN_SYNC_KEY = 'room-admin-sync';
const PUBLIC_REFRESH_MS = 60 * 1000;
const PUBLIC_API_CACHE_MS = 30 * 1000;
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

function installPublicApiCache() {
  if (window.__roomPublicApiCacheInstalled) return;
  window.__roomPublicApiCacheInstalled = true;

  const originalFetch = window.fetch.bind(window);
  const responseCache = new Map();

  window.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const method = (request.method || 'GET').toUpperCase();
    if (method !== 'GET') {
      return originalFetch(input, init);
    }

    const url = new URL(request.url, window.location.href);
    if (url.origin + url.pathname !== API_BASE_PUBLIC) {
      return originalFetch(input, init);
    }

    const year = url.searchParams.get('year') || '';
    const key = `${url.origin}${url.pathname}?year=${year}`;
    const now = Date.now();
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > now) {
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: cached.headers,
      });
    }

    const response = await originalFetch(input, init);
    if (!response.ok) {
      return response;
    }

    const body = await response.clone().text();
    responseCache.set(key, {
      body,
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
      expiresAt: now + PUBLIC_API_CACHE_MS,
    });
    return response;
  };
}

let holidayHydrationScheduled = false;
const loadNoHolidays = () => Promise.resolve({});

const publicPage = {
  monthInput: document.getElementById('startMonth'),
  calendars: document.getElementById('calendars'),
  lastSync: document.getElementById('lastSync'),
  btnPrev: document.getElementById('btnPrev3'),
  btnNext: document.getElementById('btnNext3'),
  btnReload: document.getElementById('btnReload'),
  btnTop: document.getElementById('btnTop'),
};

function createPublicCalendar(holidayLoader) {
  return RoomCalendar.create({
    apiBase: API_BASE_PUBLIC,
    monthInput: publicPage.monthInput,
    calendarsContainer: publicPage.calendars,
    lastSyncEl: publicPage.lastSync,
    viewSpanMonths: 3,
    showMonthSummary: false,
    holidayLoader,
  });
}

let publicCalendar = createPublicCalendar(loadNoHolidays);

let isReloadingPublic = false;

installPublicApiCache();

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

    if (!holidayHydrationScheduled) {
      holidayHydrationScheduled = true;
      setTimeout(() => {
        const currentMonth = publicPage.monthInput.value;
        publicCalendar = createPublicCalendar(loadTaiwanHolidays);
        if (currentMonth) {
          publicPage.monthInput.value = currentMonth;
        }
        reloadPublicCalendar({ silent: true });
      }, 0);
    }
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

bindMonthFieldPicker(publicPage.monthInput);

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
