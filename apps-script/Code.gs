/**
 * База для сайта «Түлектерге 20 жыл».
 * Вставьте в Расширения → Apps Script привязанной таблицы Google и разверните как веб-приложение
 * (Выполнять: от моего имени; Доступ: у всех). Каждый ответ — отдельная строка листа «data»
 * (path | value | updated), запись идёт под блокировкой, поэтому одновременные голоса не затирают друг друга.
 */
var SHEET_NAME = 'data';
var MAX_ROWS = 5000;
var PATH_RE = /^[A-Za-z0-9_\-]+(\/[A-Za-z0-9_\-]+)*$/;

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(SHEET_NAME);
  if (!s) {
    s = ss.insertSheet(SHEET_NAME);
    s.getRange('A:B').setNumberFormat('@');
    s.appendRow(['path', 'value', 'updated']);
  }
  return s;
}

function setPath_(t, path, val) {
  var p = path.split('/'), o = t;
  for (var i = 0; i < p.length - 1; i++) {
    if (!o[p[i]] || typeof o[p[i]] !== 'object') o[p[i]] = {};
    o = o[p[i]];
  }
  o[p[p.length - 1]] = val;
}

function tree_() {
  var s = sheet_(), n = s.getLastRow(), out = {};
  if (n < 2) return out;
  s.getRange(2, 1, n - 1, 2).getValues().forEach(function (r) {
    if (!r[0]) return;
    try { setPath_(out, String(r[0]), JSON.parse(String(r[1]))); } catch (e) {}
  });
  return out;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Чтение: вся база одним JSON
function doGet() {
  return json_(tree_());
}

// Запись: тело {"path":"votes/days/c05","val":{...}}; val = null удаляет запись
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var req = JSON.parse(e.postData.contents);
    var path = String(req.path || '');
    if (path.length > 120 || !PATH_RE.test(path)) throw new Error('bad path');
    var s = sheet_(), n = s.getLastRow(), row = 0;
    if (n >= 2) {
      var paths = s.getRange(2, 1, n - 1, 1).getValues();
      for (var i = 0; i < paths.length; i++) {
        if (paths[i][0] === path) { row = i + 2; break; }
      }
    }
    if (req.val === null || req.val === undefined) {
      if (row) s.deleteRow(row);
    } else {
      var txt = JSON.stringify(req.val);
      if (txt.length > 2000) throw new Error('value too long');
      if (row) s.getRange(row, 2, 1, 2).setValues([[txt, new Date()]]);
      else {
        if (n > MAX_ROWS) throw new Error('too many rows');
        s.appendRow([path, txt, new Date()]);
      }
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
