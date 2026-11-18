const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(os.tmpdir(), 'bt-bobby-week-' + process.pid + '.db');

const db = require('../db');
const BARS = require('../bars');
const L = require('../lineup');

BARS.upsertBars(db);

function rows(bar, date) {
  return db.prepare("SELECT s.id,s.band_id,s.set_start,s.set_end,s.stage,s.source,s.note,b.name band FROM sets s JOIN bands b ON b.id=s.band_id WHERE s.bar_id=? AND s.date=? ORDER BY s.set_start,s.id").all(bar, date);
}

function bobby(bar, date) {
  return rows(bar, date).filter(r => r.band === 'Bobby McClendon');
}

function seed() {
  for (const [id, name] of [
    ['nmc_zach-westcott', 'Zach Westcott'],
    ['nmc_bobby-mcclendon', 'Bobby McClendon'],
    ['nmc_the-beasley-brothers', 'The Beasley Brothers'],
    ['nmc_nathan-wilson', 'Nathan Wilson'],
    ['nmc_joe-barron', 'Joe Barron']
  ]) db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run(id, name);

  const ins = db.prepare("INSERT OR REPLACE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,source_url,stage,note) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
  // Live Nov 18 Luke's 32 Bridge, from the bar's own site (times as currently listed).
  ins.run('2026-11-18-luke32-0', 'luke32', 'nmc_zach-westcott', '2026-11-18', '11:00', '14:00', '2026-11-18-slot0', 'bar', 'https://lukes32bridge.com/live-music/', null, null);
  ins.run('2026-11-18-luke32-1', 'luke32', 'nmc_bobby-mcclendon', '2026-11-18', '14:00', '17:00', '2026-11-18-slot1', 'bar', 'https://lukes32bridge.com/live-music/', null, null);
  ins.run('2026-11-18-luke32-2', 'luke32', 'nmc_the-beasley-brothers', '2026-11-18', '18:00', '21:00', '2026-11-18-slot2', 'bar', 'https://lukes32bridge.com/live-music/', null, null);
  ins.run('2026-11-18-luke32-3', 'luke32', 'nmc_nathan-wilson', '2026-11-18', '22:00', '01:00', '2026-11-18-slot3', 'bar', 'https://lukes32bridge.com/live-music/', null, null);

  // Open TBA grids for the other nights (plus Joe Barron already on This Bar's rooftop Nov 22).
  const tba = (bar, date) => {
    const slots = [['10:00', '14:00'], ['14:00', '18:00'], ['18:00', '22:00'], ['22:00', '02:00']];
    slots.forEach((s, i) => ins.run(`${date}-${bar}-${i}`, bar, 'tba', date, s[0], s[1], `${date}-slot${i}`, 'grid', null, null, null));
  };
  tba('aldeans', '2026-11-19');
  tba('luke32', '2026-11-20');
  tba('aldeans', '2026-11-21');
  tba('thisbar', '2026-11-22');
  ins.run('2026-11-22-thisbar-2', 'thisbar', 'nmc_joe-barron', '2026-11-22', '18:00', '22:00', '2026-11-22-slot2', 'manual', null, 'Rooftop Stage', null);
}

test('applyManual adds Bobby McClendon\'s Nov 18-22 sets from his own Instagram story without duplicating or overwriting other named acts', () => {
  seed();
  L.applyManual('2026-11-18');

  const nov18 = rows('luke32', '2026-11-18');
  const bobby18 = bobby('luke32', '2026-11-18');
  assert.equal(bobby18.length, 1, JSON.stringify(nov18));
  assert.equal(bobby18[0].id, '2026-11-18-luke32-1');
  assert.deepEqual(
    [bobby18[0].band, bobby18[0].set_start, bobby18[0].set_end, bobby18[0].stage, bobby18[0].source, bobby18[0].note],
    ['Bobby McClendon', '14:00', '18:00', 'Main', 'manual', 'Acoustic']
  );
  assert.deepEqual(nov18.map(r => [r.band, r.set_start, r.set_end, r.stage, r.source]), [
    ['Zach Westcott', '11:00', '14:00', null, 'bar'],
    ['Bobby McClendon', '14:00', '18:00', 'Main', 'manual'],
    ['The Beasley Brothers', '18:00', '21:00', null, 'bar'],
    ['Nathan Wilson', '22:00', '01:00', null, 'bar']
  ]);

  const bobby19 = bobby('aldeans', '2026-11-19');
  assert.equal(bobby19.length, 1, JSON.stringify(rows('aldeans', '2026-11-19')));
  assert.deepEqual(
    [bobby19[0].set_start, bobby19[0].set_end, bobby19[0].stage, bobby19[0].source, bobby19[0].id],
    ['18:00', '22:00', 'Rooftop', 'manual', '2026-11-19-aldeans-2']
  );

  const bobby20 = bobby('luke32', '2026-11-20');
  assert.equal(bobby20.length, 1, JSON.stringify(rows('luke32', '2026-11-20')));
  assert.deepEqual(
    [bobby20[0].set_start, bobby20[0].set_end, bobby20[0].stage, bobby20[0].source, bobby20[0].note, bobby20[0].id],
    ['18:00', '22:00', 'Main', 'manual', null, '2026-11-20-luke32-2']
  );

  const bobby21 = bobby('aldeans', '2026-11-21');
  assert.equal(bobby21.length, 1, JSON.stringify(rows('aldeans', '2026-11-21')));
  assert.deepEqual(
    [bobby21[0].set_start, bobby21[0].set_end, bobby21[0].stage, bobby21[0].source, bobby21[0].id],
    ['18:00', '22:00', 'Rooftop', 'manual', '2026-11-21-aldeans-2']
  );

  const nov22 = rows('thisbar', '2026-11-22');
  const joe = nov22.filter(r => r.band === 'Joe Barron');
  const bobby22 = bobby('thisbar', '2026-11-22');
  assert.equal(joe.length, 1, JSON.stringify(nov22));
  assert.deepEqual(
    [joe[0].set_start, joe[0].set_end, joe[0].stage, joe[0].source, joe[0].id],
    ['18:00', '22:00', 'Rooftop Stage', 'manual', '2026-11-22-thisbar-2']
  );
  assert.equal(bobby22.length, 1, JSON.stringify(nov22));
  assert.deepEqual(
    [bobby22[0].set_start, bobby22[0].set_end, bobby22[0].stage, bobby22[0].source],
    ['20:00', '00:00', 'Rooftop', 'manual']
  );
  assert.notEqual(bobby22[0].id, joe[0].id);

  L.applyManual('2026-11-18');
  assert.equal(bobby('luke32', '2026-11-18').length, 1);
  assert.equal(bobby('aldeans', '2026-11-19').length, 1);
  assert.equal(bobby('luke32', '2026-11-20').length, 1);
  assert.equal(bobby('aldeans', '2026-11-21').length, 1);
  assert.equal(bobby('thisbar', '2026-11-22').length, 1);
  assert.equal(rows('thisbar', '2026-11-22').filter(r => r.band === 'Joe Barron').length, 1);
  assert.equal(bobby('luke32', '2026-11-18')[0].id, '2026-11-18-luke32-1');
});

test.after(() => {
  try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-wal'); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-shm'); } catch (e) {}
});
