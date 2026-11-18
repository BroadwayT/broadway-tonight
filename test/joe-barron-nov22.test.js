const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(os.tmpdir(), 'bt-barron-nov22-' + process.pid + '.db');

const db = require('../db');
const BARS = require('../bars');
const L = require('../lineup');
const MANUAL = require('../manual-sets.json');

BARS.upsertBars(db);

function rows() {
  return db.prepare("SELECT s.id,s.band_id,s.set_start,s.set_end,s.stage,s.source,b.name band FROM sets s JOIN bands b ON b.id=s.band_id WHERE s.bar_id='thisbar' AND s.date='2026-11-22' ORDER BY s.set_start,s.id").all();
}

function named(list, name) {
  return list.filter(r => r.band === name);
}

function seedLiveLike() {
  for (const [id, name] of [
    ['nmc_joe-barron', 'Joe Barron'],
    ['nmc_bobby-mcclendon', 'Bobby McClendon']
  ]) db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run(id, name);

  const ins = db.prepare("INSERT OR REPLACE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,stage) VALUES(?,?,?,?,?,?,?,?,?)");
  const slots = [['10:00', '14:00'], ['14:00', '18:00'], ['18:00', '22:00'], ['22:00', '02:00']];
  slots.forEach((s, i) => ins.run(`2026-11-22-thisbar-${i}`, 'thisbar', 'tba', '2026-11-22', s[0], s[1], `2026-11-22-slot${i}`, 'grid', null));
  // Live state after PR 39: Joe Barron from his Nov 3 flyer on the 6-10 PM grid slot, Bobby already added beside him.
  ins.run('2026-11-22-thisbar-2', 'thisbar', 'nmc_joe-barron', '2026-11-22', '18:00', '22:00', '2026-11-22-slot2', 'manual', 'Rooftop Stage');
  ins.run('2026-11-22-thisbar-2-m-nmc_bobby-mcclendon-2000', 'thisbar', 'nmc_bobby-mcclendon', '2026-11-22', '20:00', '00:00', '2026-11-22-slot2', 'manual', 'Rooftop');
}

test('manual-sets.json lists Joe Barron at This Bar Nov 22 from 4-8 PM on Rooftop from the bar\'s own site', () => {
  const joe = (MANUAL.sets || []).filter(m => m.bar === 'thisbar' && m.date === '2026-11-22' && m.band === 'Joe Barron');
  assert.equal(joe.length, 1, JSON.stringify(joe));
  assert.deepEqual(
    [joe[0].start, joe[0].end, joe[0].stage, joe[0].source],
    ['16:00', '20:00', 'Rooftop', "Bar's own site (https://mwthisbar.com/music/, seen Nov 17 2026)"]
  );
  const bobby = (MANUAL.sets || []).filter(m => m.bar === 'thisbar' && m.date === '2026-11-22' && m.band === 'Bobby McClendon');
  assert.equal(bobby.length, 1);
  assert.equal(bobby[0].stage, 'Rooftop');
});

test('applyManual moves the live Nov 22 Joe Barron This Bar rooftop row in place to 4-8 PM and does not duplicate Bobby McClendon', () => {
  seedLiveLike();
  L.applyManual('2026-11-22');
  const first = rows();
  const joe = named(first, 'Joe Barron');
  const bobby = named(first, 'Bobby McClendon');
  assert.equal(joe.length, 1, JSON.stringify(first));
  assert.equal(joe[0].id, '2026-11-22-thisbar-2');
  assert.deepEqual(
    [joe[0].set_start, joe[0].set_end, joe[0].stage, joe[0].source],
    ['16:00', '20:00', 'Rooftop', 'manual']
  );
  assert.equal(bobby.length, 1, JSON.stringify(first));
  assert.deepEqual(
    [bobby[0].id, bobby[0].set_start, bobby[0].set_end, bobby[0].stage, bobby[0].source],
    ['2026-11-22-thisbar-2-m-nmc_bobby-mcclendon-2000', '20:00', '00:00', 'Rooftop', 'manual']
  );

  L.applyManual('2026-11-22');
  const second = rows();
  assert.equal(named(second, 'Joe Barron').length, 1);
  assert.equal(named(second, 'Bobby McClendon').length, 1);
  assert.deepEqual(
    named(second, 'Joe Barron').concat(named(second, 'Bobby McClendon')).map(r => [r.band, r.set_start, r.set_end, r.stage, r.id, r.source]),
    named(first, 'Joe Barron').concat(named(first, 'Bobby McClendon')).map(r => [r.band, r.set_start, r.set_end, r.stage, r.id, r.source])
  );
});

test.after(() => {
  try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-wal'); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-shm'); } catch (e) {}
});
