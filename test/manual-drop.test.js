const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(os.tmpdir(), 'bt-manual-drop-' + process.pid + '.db');

const db = require('../db');
const BARS = require('../bars');
const L = require('../lineup');

BARS.upsertBars(db);

const KABBES = 'nmc_kristine-kabbes-and-the-skallywags';
db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run(KABBES, 'Kristine Kabbes and the Skallywags');
db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run('nmc_old-act', 'Old Act');
db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run('nmc_owner-act', 'Owner Act');

const ins = db.prepare('INSERT OR REPLACE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,stage) VALUES(?,?,?,?,?,?,?,?,?)');
ins.run('2026-11-17-bootbarn-2', 'bootbarn', KABBES, '2026-11-17', '19:00', '22:00', '2026-11-17-slot2', 'manual', 'Rooftop');
ins.run('2026-11-17-bootbarn-st-rooftop-1900-' + KABBES, 'bootbarn', KABBES, '2026-11-17', '19:00', '22:00', '2026-11-17-slot2', 'manual', 'Rooftop');
ins.run('2026-11-18-legends-2', 'legends', KABBES, '2026-11-18', '19:00', '22:00', '2026-11-18-slot2', 'manual', null);
ins.run('2026-11-17-layla-m-old', 'layla', 'nmc_old-act', '2026-11-17', '18:00', '22:00', '2026-11-17-slot2', 'manual', null);
ins.run('2026-11-17-roberts-2', 'roberts', 'nmc_owner-act', '2026-11-17', '18:00', '22:00', '2026-11-17-slot2', 'owner', null);
ins.run('2026-11-10-bootbarn-2', 'bootbarn', KABBES, '2026-11-10', '19:00', '22:00', '2026-11-10-slot2', 'manual', 'Rooftop');
db.prepare('INSERT INTO ratings(bar_id,band_id,set_id,set_window_id,rating,device_id,ip_hash,check_in,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
  .run('layla', 'nmc_old-act', '2026-11-17-layla-m-old', '2026-11-17-slot2', 5, 'dev-drop', 'ip', 0, 1);

function kabbes(bar, date) {
  return db.prepare("SELECT s.id,s.set_start,s.set_end,s.stage,s.source,b.name band FROM sets s JOIN bands b ON b.id=s.band_id WHERE s.bar_id=? AND s.date=? AND b.name LIKE '%Kabbes%' ORDER BY s.set_start,s.id").all(bar, date);
}

test('a removed manual set reverts its grid row to TBA and a time change updates in place', () => {
  L.applyManual('2026-11-17');
  L.applyManual('2026-11-17');

  const boot = db.prepare('SELECT band_id,set_start,set_end,stage,source FROM sets WHERE id=?').get('2026-11-17-bootbarn-2');
  assert.equal(boot.band_id, 'tba');
  assert.equal(boot.set_start, '18:00');
  assert.equal(boot.set_end, '22:00');
  assert.equal(boot.stage, null);
  assert.equal(boot.source, 'grid');
  assert.equal(kabbes('bootbarn', '2026-11-17').length, 0);
  assert.equal(db.prepare('SELECT id FROM sets WHERE id=?').get('2026-11-17-bootbarn-st-rooftop-1900-' + KABBES), undefined);

  const leg = kabbes('legends', '2026-11-18');
  assert.equal(leg.length, 1, JSON.stringify(leg));
  assert.equal(leg[0].id, '2026-11-18-legends-2');
  assert.equal(leg[0].set_start, '18:45');
  assert.equal(leg[0].set_end, '20:00');
  assert.equal(leg[0].source, 'manual');

  const rated = db.prepare('SELECT band_id,source,set_start FROM sets WHERE id=?').get('2026-11-17-layla-m-old');
  assert.equal(rated.band_id, 'nmc_old-act');
  assert.equal(rated.source, 'manual');
  assert.equal(rated.set_start, '18:00');
  const owner = db.prepare('SELECT band_id,source FROM sets WHERE id=?').get('2026-11-17-roberts-2');
  assert.equal(owner.band_id, 'nmc_owner-act');
  assert.equal(owner.source, 'owner');
  const past = db.prepare('SELECT band_id,source,set_start FROM sets WHERE id=?').get('2026-11-10-bootbarn-2');
  assert.equal(past.band_id, KABBES);
  assert.equal(past.source, 'manual');
  assert.equal(past.set_start, '19:00');

  const kevin = db.prepare("SELECT s.set_start,s.set_end,s.source FROM sets s JOIN bands b ON b.id=s.band_id WHERE s.bar_id='flp' AND s.date='2026-11-19' AND b.name='Kevin Powers'").all();
  assert.equal(kevin.length, 1);
  assert.equal(kevin[0].set_start, '20:00');
  assert.equal(kevin[0].set_end, '23:00');
});

test.after(() => {
  try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-wal'); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-shm'); } catch (e) {}
});
