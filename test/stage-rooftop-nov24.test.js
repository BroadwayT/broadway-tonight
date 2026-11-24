const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(os.tmpdir(), 'bt-stage-rooftop-nov24-' + process.pid + '.db');

const db = require('../db');
const BARS = require('../bars');
const L = require('../lineup');
const MANUAL = require('../manual-sets.json');

BARS.upsertBars(db);

const DATE = '2026-11-24';
const KABBES = 'nmc_kristine-kabbes-and-the-skallywags';

for (const [id, name] of [
  ['nmc_easton-hamlin', 'Easton Hamlin'],
  ['nmc_sarah-montgomery', 'Sarah Montgomery'],
  ['nmc_luke-maurer', 'Luke Maurer'],
  ['nmc_cory-farley', 'Cory Farley'],
  ['act_mariel-mae', 'Mariel Mae'],
  [KABBES, 'Kristine Kabbes and the Skallywags'],
  ['nmc_blake-dixon', 'Blake Dixon']
]) db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run(id, name);

const ins = db.prepare('INSERT OR REPLACE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,stage) VALUES(?,?,?,?,?,?,?,?,?)');
const live = [
  ['2026-11-24-bootbarn-0', 'nmc_easton-hamlin', '10:00', '14:15', '2026-11-24-slot0', null],
  ['2026-11-24-bootbarn-1', 'nmc_sarah-montgomery', '14:45', '18:15', '2026-11-24-slot1', null],
  ['2026-11-24-bootbarn-2-m-nmc_luke-maurer-1845', 'nmc_luke-maurer', '18:45', '22:15', '2026-11-24-slot2', null],
  ['2026-11-24-bootbarn-3', 'nmc_cory-farley', '22:45', '02:30', '2026-11-24-slot3', null],
  ['2026-11-24-bootbarn-st-rooftop-1415-act_mariel-mae', 'act_mariel-mae', '14:15', '18:15', '2026-11-24-slot1', 'Rooftop'],
  ['2026-11-24-bootbarn-st-rooftop-1430-act_mariel-mae', 'act_mariel-mae', '14:30', '18:15', '2026-11-24-slot1', 'Rooftop'],
  ['2026-11-24-bootbarn-st-rooftop-1815-' + KABBES, KABBES, '18:15', '22:15', '2026-11-24-slot2', 'Rooftop'],
  ['2026-11-24-bootbarn-st-rooftop-1845-' + KABBES, KABBES, '18:45', '22:15', '2026-11-24-slot2', 'Rooftop'],
  ['2026-11-24-bootbarn-2', KABBES, '19:00', '22:00', '2026-11-24-slot2', 'Rooftop'],
  ['2026-11-24-bootbarn-st-rooftop-2215-nmc_blake-dixon', 'nmc_blake-dixon', '22:15', '02:30', '2026-11-24-slot3', 'Rooftop'],
  ['2026-11-24-bootbarn-st-rooftop-2245-nmc_blake-dixon', 'nmc_blake-dixon', '22:45', '02:30', '2026-11-24-slot3', 'Rooftop']
];
for (const [id, band, start, end, win, stage] of live) ins.run(id, 'bootbarn', band, DATE, start, end, win, 'manual', stage);

function boot() {
  return db.prepare("SELECT s.id,b.name band,s.set_start start,s.set_end end,s.stage,s.source FROM sets s JOIN bands b ON b.id=s.band_id WHERE s.bar_id='bootbarn' AND s.date=? AND s.band_id<>'tba' ORDER BY COALESCE(s.stage,''), s.set_start, b.name").all(DATE);
}

test('Nov 24 Stage rooftop file keeps the story times and applyManual drops the old starts', () => {
  const roof = (MANUAL.sets || []).filter(s => s.date === DATE && s.bar === 'bootbarn' && s.stage === 'Rooftop');
  assert.deepEqual(roof.map(s => [s.band, s.start, s.end]).sort(), [
    ['Blake Dixon', '22:15', '02:30'],
    ['Kristine Kabbes and the Skallywags', '18:15', '22:15'],
    ['Mariel Mae', '14:15', '18:15']
  ]);
  const main = (MANUAL.sets || []).filter(s => s.date === DATE && s.bar === 'bootbarn' && !s.stage);
  assert.deepEqual(main.map(s => [s.band, s.start, s.end]), [
    ['Easton Hamlin', '10:00', '14:15'],
    ['Sarah Montgomery', '14:45', '18:15'],
    ['Luke Maurer', '18:45', '22:15'],
    ['Cory Farley', '22:45', '02:30']
  ]);

  L.applyManual(DATE);
  L.applyManual(DATE);

  const rows = boot();
  const show = rows.map(r => [r.band, r.start, r.end, r.stage]);
  assert.deepEqual(show, [
    ['Easton Hamlin', '10:00', '14:15', null],
    ['Sarah Montgomery', '14:45', '18:15', null],
    ['Luke Maurer', '18:45', '22:15', null],
    ['Cory Farley', '22:45', '02:30', null],
    ['Mariel Mae', '14:15', '18:15', 'Rooftop'],
    ['Kristine Kabbes and the Skallywags', '18:15', '22:15', 'Rooftop'],
    ['Blake Dixon', '22:15', '02:30', 'Rooftop']
  ], JSON.stringify(rows, null, 2));
  for (const r of rows) assert.equal(r.source, 'manual', r.id);
  assert.equal(db.prepare('SELECT id FROM sets WHERE id=?').get('2026-11-24-bootbarn-st-rooftop-1430-act_mariel-mae'), undefined);
  assert.equal(db.prepare('SELECT id FROM sets WHERE id=?').get('2026-11-24-bootbarn-st-rooftop-1845-' + KABBES), undefined);
  assert.equal(db.prepare('SELECT id FROM sets WHERE id=?').get('2026-11-24-bootbarn-st-rooftop-2245-nmc_blake-dixon'), undefined);
  const slot2 = db.prepare('SELECT band_id,stage FROM sets WHERE id=?').get('2026-11-24-bootbarn-2');
  assert.ok(!slot2 || slot2.band_id !== KABBES, JSON.stringify(slot2));
});

test.after(() => {
  try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-wal'); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-shm'); } catch (e) {}
});
