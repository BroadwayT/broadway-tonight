const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(os.tmpdir(), 'bt-roberts-covered-tba-' + process.pid + '.db');

const db = require('../db');
const BARS = require('../bars');
const L = require('../lineup');

BARS.upsertBars(db);

function rows(date) {
  return db.prepare("SELECT s.id,s.band_id,s.set_start,s.set_end,s.stage,s.source,b.name band FROM sets s JOIN bands b ON b.id=s.band_id WHERE s.bar_id='roberts' AND s.date=? ORDER BY s.set_start,s.id").all(date);
}

function seedNov18BeforeMove() {
  for (const [id, name] of [
    ['nmc_dave-cox', 'Dave Cox'],
    ['nmc_paul-kramer', 'Paul Kramer'],
    ["nmc_kelley's-heroes", "Kelley's Heroes"],
    ['nmc_the-cowpokes', 'The Cowpokes']
  ]) db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run(id, name);
  const ins = db.prepare('INSERT OR REPLACE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,stage) VALUES(?,?,?,?,?,?,?,?,?)');
  ins.run('2026-11-18-roberts-0', 'roberts', 'nmc_dave-cox', '2026-11-18', '10:00', '14:30', '2026-11-18-slot0', 'manual', null);
  ins.run('2026-11-18-roberts-1', 'roberts', 'nmc_paul-kramer', '2026-11-18', '14:30', '18:30', '2026-11-18-slot1', 'manual', null);
  ins.run('2026-11-18-roberts-2', 'roberts', "nmc_kelley's-heroes", '2026-11-18', '18:30', '22:30', '2026-11-18-slot2', 'manual', null);
  ins.run('2026-11-18-roberts-3', 'roberts', 'nmc_the-cowpokes', '2026-11-18', '22:30', '01:30', '2026-11-18-slot3', 'manual', null);
}

test("applyManual drops the leftover Robert's 2 PM TBA after Kelley's Heroes moves into that slot", () => {
  seedNov18BeforeMove();
  L.applyManual('2026-11-18');
  const first = rows('2026-11-18');
  assert.equal(first.some(r => r.band === 'Live bands all day' || r.band_id === 'tba' || r.source === 'grid'), false, JSON.stringify(first));
  const kelley = first.filter(r => r.band === "Kelley's Heroes");
  assert.equal(kelley.length, 1, JSON.stringify(first));
  assert.equal(kelley[0].set_start, '14:30');
  assert.equal(kelley[0].set_end, '18:00');
  assert.equal(first.some(r => r.band === 'Paul Kramer'), false);
  const wendy = first.filter(r => /Wendy Newcomer/.test(r.band));
  assert.equal(wendy.length, 1, JSON.stringify(first));
  assert.equal(wendy[0].set_start, '18:30');
  assert.equal(wendy[0].set_end, '22:00');

  L.ensureDay('2026-11-18');
  L.applyManual('2026-11-18');
  const second = rows('2026-11-18');
  assert.equal(second.some(r => r.band === 'Live bands all day' || r.band_id === 'tba' || r.source === 'grid'), false, JSON.stringify(second));
});

test("Wendy's shorter Nov 19-21 end times do not leave a Robert's TBA placeholder", () => {
  L.applyManual('2026-11-18');
  L.ensureDay('2026-11-19');
  L.ensureDay('2026-11-20');
  L.ensureDay('2026-11-21');
  for (const date of ['2026-11-19', '2026-11-20', '2026-11-21']) {
    const list = rows(date);
    assert.equal(list.some(r => r.band === 'Live bands all day' || r.band_id === 'tba' || r.source === 'grid'), false, date + ' ' + JSON.stringify(list));
  }
  const thu = rows('2026-11-19').find(r => /Wendy Newcomer/.test(r.band));
  assert.ok(thu, 'missing Thursday Wendy');
  assert.equal(thu.set_start, '10:00');
  assert.equal(thu.set_end, '14:00');
  const fri = rows('2026-11-20').find(r => /Wendy Newcomer/.test(r.band));
  assert.equal(fri.set_start, '14:30');
  assert.equal(fri.set_end, '18:00');
  const sat = rows('2026-11-21').find(r => /Wendy Newcomer/.test(r.band));
  assert.equal(sat.set_start, '14:30');
  assert.equal(sat.set_end, '18:00');
});

test("dropCoveredTba removes an already-live leftover Robert's 2 PM TBA", () => {
  for (const [id, name] of [["nmc_kelley's-heroes", "Kelley's Heroes"]])
    db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run(id, name);
  const ins = db.prepare('INSERT OR REPLACE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,stage) VALUES(?,?,?,?,?,?,?,?,?)');
  ins.run('2026-11-18-roberts-2', 'roberts', "nmc_kelley's-heroes", '2026-11-18', '14:30', '18:00', '2026-11-18-slot2', 'manual', null);
  ins.run('2026-11-18-roberts-1', 'roberts', 'tba', '2026-11-18', '14:00', '18:00', '2026-11-18-slot1', 'grid', null);
  assert.ok(rows('2026-11-18').some(r => r.id === '2026-11-18-roberts-1' && r.band_id === 'tba'));
  L.dropCoveredTba('2026-11-18');
  const list = rows('2026-11-18');
  assert.equal(list.some(r => r.id === '2026-11-18-roberts-1' || (r.band_id === 'tba' && r.set_start === '14:00')), false, JSON.stringify(list));
  assert.ok(list.some(r => r.band === "Kelley's Heroes" && r.set_start === '14:30'));
});

test.after(() => {
  try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-wal'); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-shm'); } catch (e) {}
});
