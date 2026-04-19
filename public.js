const API_BASE_PUBLIC =
  'https://script.google.com/macros/s/AKfycbyX3WVu_DLrx0gRehHButc0fjsjqRuS23UAjOPZWhy9nOt-cYOxIgMCLUu-OcV1n15f8g/exec';

const holidayAliases = [
  ['中華民國開國紀念日', '元旦'],
  ['和平紀念日', '228'],
  ['兒童節及民族掃墓節', '兒童/清明'],
  ['民族掃墓節', '清明'],
  ['勞動節', '勞動'],
  ['端午節', '端午'],
  ['中秋節', '中秋'],
  ['農曆除夕', '除夕'],
  ['春節', '春節'],
];

function normalizeHolidayName(name) {
  for (const entry of holidayAliases) {
    if (name.includes(entry[0])) return entry[1];
  }
  return name.replace(/\s+/g, '').slice(0, 8);
}

async function loadTaiwanHolidays(year) {
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
    const dateStr = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    out[dateStr] = normalizeHolidayName(item.description);
  });
  return out;
}

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
  contactPhone: document.body.dataset.phone || '0905385388',
  holidayLoader: loadTaiwanHolidays,
});

function syncPublicNavState() {
  if (publicPage.btnPrev) {
    publicPage.btnPrev.disabled = !publicCalendar.canShiftMonths(-3);
  }
  if (publicPage.btnNext) {
    publicPage.btnNext.disabled = !publicCalendar.canShiftMonths(3);
  }
}

async function reloadPublicCalendar({ goToday = false } = {}) {
  const btn = publicPage.btnReload;

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = '同步中...';
    }
    if (goToday) {
      publicCalendar.goToday();
    }
    syncPublicNavState();
    await publicCalendar.reload();
  } catch (error) {
    console.error(error);
    alert('資料同步失敗，請稍後再試。');
    if (publicPage.lastSync) {
      publicPage.lastSync.textContent = '同步失敗';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '回到本月';
    }
    syncPublicNavState();
  }
}

publicPage.btnReload.addEventListener('click', () =>
  reloadPublicCalendar({ goToday: true })
);
publicPage.btnPrev.addEventListener('click', () => {
  publicCalendar.shiftMonths(-3);
  syncPublicNavState();
  reloadPublicCalendar();
});
publicPage.btnNext.addEventListener('click', () => {
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

reloadPublicCalendar({ goToday: true });
