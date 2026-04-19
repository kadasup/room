/***** Basic settings: confirm SHEET_ID and worksheet name *****/
const SHEET_ID = '1sWSZIq3BpEh9UHgLYovRBexe7dIFs6cTOPsub5G1sbI';
const SHEET_NAME = 'status';
const TOKEN = '1234567890';

/***** Entry point: read *****/
function doGet(e) {
  try {
    const year = parseInt((e.parameter.year || '').trim(), 10);
    if (!year) return _json({ ok: false, error: 'missing year' });
    const status = _readYear(year);
    return _json({
      ok: true,
      year,
      status,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

/***** Entry point: write (supports JSON and form posts) *****/
function doPost(e) {
  try {
    const payload = _parsePost(e);
    if (!_checkAuth(payload && payload.token)) {
      return _json({ ok: false, error: 'unauthorized' });
    }

    const year = parseInt(payload.year, 10);
    if (!year) return _json({ ok: false, error: 'missing year' });

    // delta shape: { 'YYYY-MM-DD': 'full' | 'free' | '' }
    let delta = payload.delta;
    if (!delta && payload.date) {
      delta = {};
      delta[String(payload.date)] = payload.status || '';
    }
    if (!delta || typeof delta !== 'object') {
      return _json({ ok: false, error: 'invalid delta' });
    }

    _writeYearDelta(delta);

    const status = _readYear(year);
    return _json({
      ok: true,
      data: { year, status },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

/***** Helpers and data layer *****/
function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function _checkAuth(token) {
  return token && token === TOKEN;
}

function _parsePost(e) {
  if (e.postData && e.postData.type === 'application/json') {
    const body = JSON.parse(e.postData.contents || '{}');
    return {
      token: body.token,
      year: body.year,
      delta: body.delta,
      date: body.date,
      status: body.status,
    };
  }

  return {
    token: e.parameter.token,
    year: e.parameter.year,
    delta: e.parameter.delta ? JSON.parse(e.parameter.delta) : null,
    date: e.parameter.date,
    status: e.parameter.status,
  };
}

function _sheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 2).setValues([['date', 'status']]);
  }
  return sh;
}

function _readAll() {
  const sh = _sheet();
  const last = sh.getLastRow();
  if (last < 2) return {};

  const rng = sh.getRange(2, 1, last - 1, 2).getValues();
  const map = {};
  rng.forEach(([d, s]) => {
    const ds = typeof d === 'string' ? d.trim() : _asDateStr(d);
    if (ds) map[ds] = (s || '').trim() || 'free';
  });
  return map;
}

function _readYear(year) {
  const all = _readAll();
  const prefix = String(year) + '-';
  const out = {};
  Object.keys(all).forEach((k) => {
    if (k.startsWith(prefix)) out[k] = all[k];
  });
  return out;
}

function _writeYearDelta(delta) {
  const sh = _sheet();
  const last = sh.getLastRow();
  const rows = last >= 2 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
  const idx = {};

  rows.forEach((row, i) => {
    const ds = typeof row[0] === 'string' ? row[0].trim() : _asDateStr(row[0]);
    if (ds) idx[ds] = i + 2;
  });

  const toSet = [];
  const toAppend = [];

  Object.keys(delta).forEach((ds) => {
    const v = (delta[ds] || '').trim();
    if (idx[ds]) {
      toSet.push({ r: idx[ds], v: v || 'free' });
    } else {
      toAppend.push([ds, v || 'free']);
    }
  });

  if (toSet.length) {
    toSet.forEach((item) => {
      sh.getRange(item.r, 2, 1, 1).setValue(item.v);
    });
  }
  if (toAppend.length) {
    sh.getRange(sh.getLastRow() + 1, 1, toAppend.length, 2).setValues(toAppend);
  }
}

function _asDateStr(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) {
    return Utilities.formatDate(
      v,
      Session.getScriptTimeZone() || 'Asia/Taipei',
      'yyyy-MM-dd'
    );
  }
  return '';
}
