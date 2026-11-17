const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(os.tmpdir(), 'bt-lb-nov17-' + process.pid + '.db');

const db = require('../db');
const BARS = require('../bars');
const L = require('../lineup');

BARS.upsertBars(db);

function rows() {
  return db.prepare("SELECT s.id,s.band_id,s.set_start,s.set_end,s.stage,s.source,b.name band FROM sets s JOIN bands b ON b.id=s.band_id WHERE s.bar_id='luckybastard' AND s.date='2026-11-17' ORDER BY s.set_start,s.id").all();
}

function seedLiveLike() {
  for (const [id, name] of [
    ['nmc_theresa-veneziano', 'Theresa Veneziano'],
    ['nmc_cullen-greer', 'Cullen Greer'],
    ['nmc_ricky-rooker', 'Ricky Rooker']
  ]) db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run(id, name);
  const ins = db.prepare('INSERT OR REPLACE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,stage) VALUES(?,?,?,?,?,?,?,?,?)');
  ins.run('2026-11-17-luckybastard-0', 'luckybastard', 'nmc_theresa-veneziano', '2026-11-17', '12:00', '16:00', '2026-11-17-slot0', 'manual', null);
  ins.run('2026-11-17-luckybastard-1', 'luckybastard', 'nmc_cullen-greer', '2026-11-17', '16:00', '20:00', '2026-11-17-slot1', 'manual', null);
  ins.run('2026-11-17-luckybastard-2', 'luckybastard', 'nmc_ricky-rooker', '2026-11-17', '20:00', '00:00', '2026-11-17-slot2', 'manual', null);
  ins.run('2026-11-17-luckybastard-3', 'luckybastard', 'tba', '2026-11-17', '22:00', '02:00', '2026-11-17-slot3', 'grid', null);
}

function assertThreeMainStage(list) {
  assert.equal(list.length, 3, JSON.stringify(list));
  assert.deepEqual(list.map(r => [r.band, r.set_start, r.set_end, r.stage, r.source]), [
    ['Theresa Veneziano', '12:00', '16:00', 'Main Stage', 'manual'],
    ['Cullen Greer', '16:00', '20:00', 'Main Stage', 'manual'],
    ['Ricky Rooker', '20:00', '00:00', 'Main Stage', 'manual']
  ]);
  assert.equal(list.some(r => r.band === 'Live bands all day' || r.band_id === 'tba' || r.source === 'grid'), false);
}

test('applyManual replaces live Nashville Lineup Lucky Bastard Nov 17 rows in place and drops the leftover 10 PM TBA slot', () => {
  seedLiveLike();
  L.applyManual('2026-11-17');
  const first = rows();
  assertThreeMainStage(first);
  assert.equal(first[0].id, '2026-11-17-luckybastard-0');
  assert.equal(first[1].id, '2026-11-17-luckybastard-1');
  assert.equal(first[2].id, '2026-11-17-luckybastard-2');
  L.applyManual('2026-11-17');
  const second = rows();
  assertThreeMainStage(second);
  assert.deepEqual(second.map(r => r.id), first.map(r => r.id));
});

test.after(() => {
  try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-wal'); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-shm'); } catch (e) {}
});
