const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(os.tmpdir(), 'bt-redneck-thanksgiving-' + process.pid + '.db');

const db = require('../db');
const BARS = require('../bars');
const L = require('../lineup');
const MANUAL = require('../manual-sets.json');

BARS.upsertBars(db);

const BAR = 'redneckriviera';
const WED = '2026-11-25';
const THU = '2026-11-26';
const FRI = '2026-11-27';
const SLOTS = [['10:00', '14:00'], ['14:00', '18:00'], ['18:00', '22:00'], ['22:00', '02:00']];
const THU_STARTS = ['10:00', '14:00', '18:00', '22:00'];

function rows(date) {
  return db.prepare("SELECT s.id,s.band_id,s.set_start,s.set_end,s.stage,s.source,b.name band FROM sets s JOIN bands b ON b.id=s.band_id WHERE s.bar_id=? AND s.date=? ORDER BY s.set_start,s.id").all(BAR, date);
}

function isPlaceholder(r) {
  return r.band === 'Live bands all day' || r.band_id === 'tba' || r.source === 'grid';
}

function seedLiveGrid() {
  db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run('act_megan-golden', 'Megan Golden');
  db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run('act_jenna-jane', 'Jenna Jane');
  const ins = db.prepare('INSERT OR REPLACE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,stage) VALUES(?,?,?,?,?,?,?,?,?)');
  // Stale ends from the Wednesday-closure pass. applyManual must write the manual ends back, including Jenna's row stored beside the filled morning slot.
  ins.run(WED + '-' + BAR + '-0', BAR, 'act_megan-golden', WED, '12:00', '14:00', WED + '-slot0', 'manual', null);
  ins.run(WED + '-' + BAR + '-0-m-act_jenna-jane-1300', BAR, 'act_jenna-jane', WED, '13:00', '14:00', WED + '-slot0', 'manual', null);
  for (const date of [WED, THU]) {
    SLOTS.forEach((s, i) => {
      if (date === WED && i === 0) return;
      ins.run(date + '-' + BAR + '-' + i, BAR, 'tba', date, s[0], s[1], date + '-slot' + i, 'grid', null);
    });
  }
}

test('manual-sets.json keeps Nov 25 Redneck sets open and closes only Thanksgiving Day', () => {
  const wed = (MANUAL.sets || []).filter(m => m.bar === BAR && m.date === WED);
  assert.deepEqual(wed.map(m => [m.band, m.start, m.end]), [
    ['Megan Golden', '12:00', '15:00'],
    ['Jenna Jane', '13:00', '16:00']
  ]);
  assert.equal((MANUAL.sets || []).filter(m => m.bar === BAR && m.date === THU).length, 0);
  const closures = (MANUAL.closures || []).filter(c => c.bar === BAR);
  assert.equal(closures.some(c => c.date === WED), false, JSON.stringify(closures));
  assert.deepEqual(closures.map(c => [c.date, c.closed_from, c.closed_to]), [
    [THU, '10:00', '03:00']
  ]);
  const buck = (MANUAL.sets || []).find(m => m.bar === BAR && m.date === FRI && m.band === 'Buck McCoy');
  assert.ok(buck, 'Friday reopen set missing');
  assert.equal(buck.start, '10:00');
  assert.equal(buck.end, '13:00');
});

test('Redneck is closed all of Thanksgiving and open on Nov 25, and a stored second-set end is corrected', () => {
  seedLiveGrid();
  for (const start of THU_STARTS) {
    assert.equal(L.isClosed(BAR, WED, start), false, WED + ' ' + start);
    assert.equal(L.isClosed(BAR, THU, start), true, THU + ' ' + start);
    assert.equal(L.isClosed(BAR, FRI, start), false, FRI + ' ' + start);
  }
  assert.equal(L.isClosed('olered', THU, '10:00'), true);
  assert.equal(L.isClosed('acme', THU, '10:00'), true);
  assert.equal(L.isClosed('wildhorse', THU, '10:00'), true);

  L.applyManual(WED);
  L.ensureDay(WED);
  L.ensureDay(THU);

  const wed = rows(WED);
  const named = wed.filter(r => !isPlaceholder(r));
  assert.deepEqual(named.map(r => [r.band, r.set_start, r.set_end, r.source]), [
    ['Megan Golden', '12:00', '15:00', 'manual'],
    ['Jenna Jane', '13:00', '16:00', 'manual']
  ], JSON.stringify(wed));
  assert.equal(named.find(r => r.band === 'Jenna Jane').id, WED + '-' + BAR + '-0-m-act_jenna-jane-1300');
  assert.deepEqual(wed.filter(isPlaceholder).map(r => [r.set_start, r.set_end]), [
    ['14:00', '18:00'],
    ['18:00', '22:00'],
    ['22:00', '02:00']
  ], JSON.stringify(wed));

  const thu = rows(THU);
  assert.equal(thu.length, 0, JSON.stringify(thu));
  for (const start of THU_STARTS) assert.equal(thu.some(r => r.set_start === start), false, start);

  const fri = rows(FRI);
  const buck = fri.find(r => r.band === 'Buck McCoy');
  assert.ok(buck, JSON.stringify(fri));
  assert.equal(buck.set_start, '10:00');
  assert.equal(buck.set_end, '13:00');
  assert.equal(fri.some(isPlaceholder), false, JSON.stringify(fri));

  db.prepare('DELETE FROM sets WHERE bar_id=? AND date=?').run(BAR, WED);
  L.ensureDay(WED);
  L.ensureDay(THU);
  assert.deepEqual(rows(WED).map(r => [r.band, r.set_start, r.set_end, r.source]), SLOTS.map(s => ['Live bands all day', s[0], s[1], 'grid']), JSON.stringify(rows(WED)));
  assert.equal(rows(THU).length, 0, JSON.stringify(rows(THU)));
});

test.after(() => {
  try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-wal'); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-shm'); } catch (e) {}
});
