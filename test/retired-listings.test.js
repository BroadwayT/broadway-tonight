const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(os.tmpdir(), 'bt-retired-listings-' + process.pid + '.db');

const db = require('../db');
const BARS = require('../bars');
const L = require('../lineup');
const SRC = require('../sources');

BARS.upsertBars(db);
db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run('act_scraped', 'Scraped Act');
db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run('act_kept', 'Kept Act');
db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run('act_rated', 'Rated Act');
db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run('act_owner', 'Owner Act');
db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run('act_bar', 'Bar Site Act');

const ins = db.prepare('INSERT OR REPLACE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,source_url,stage) VALUES(?,?,?,?,?,?,?,?,?,?)');
ins.run('2026-11-17-legends-2', 'legends', 'act_scraped', '2026-11-17', '18:45', '22:15', '2026-11-17-slot2', 'nmc', 'https://example.test/old', null);
ins.run('2026-11-17-legends-2-x2', 'legends', 'act_scraped', '2026-11-17', '22:00', '02:00', '2026-11-17-slot3', 'nmc', 'https://example.test/extra', null);
ins.run('2026-11-18-roberts-1', 'roberts', 'act_scraped', '2026-11-18', '14:00', '18:00', '2026-11-18-slot1', 'nmc', null, null);
ins.run('2026-11-17-bootbarn-2', 'bootbarn', 'act_kept', '2026-11-17', '19:00', '22:00', '2026-11-17-slot2', 'manual', null, 'Rooftop');
ins.run('2026-11-17-tootsies-2', 'tootsies', 'act_owner', '2026-11-17', '18:00', '22:00', '2026-11-17-slot2', 'owner', null, null);
ins.run('2026-11-17-luke32-2-x-rated', 'luke32', 'act_rated', '2026-11-17', '18:00', '22:00', '2026-11-17-slot2', 'nmc', 'https://example.test/rated', null);
ins.run('2026-11-16-legends-2', 'legends', 'act_scraped', '2026-11-16', '18:45', '22:15', '2026-11-16-slot2', 'nmc', null, null);
ins.run('2026-11-17-acme-0', 'acme', 'act_bar', '2026-11-17', '10:00', '14:00', '2026-11-17-slot0', 'bar', null, null);
db.prepare('INSERT INTO ratings(bar_id,band_id,set_id,set_window_id,rating,device_id,ip_hash,check_in,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
  .run('luke32', 'act_rated', '2026-11-17-luke32-2-x-rated', '2026-11-17-slot2', 5, 'dev-retired', 'ip', 0, 1);

test('retired scraped rows for today and later revert or delete, and protected rows stay', () => {
  assert.equal(L.purgeRetiredListings('2026-11-17'), 3);

  const grid = db.prepare('SELECT band_id,set_start,set_end,stage,source,source_url FROM sets WHERE id=?').get('2026-11-17-legends-2');
  assert.equal(grid.band_id, 'tba');
  assert.equal(grid.set_start, '18:00');
  assert.equal(grid.set_end, '22:00');
  assert.equal(grid.stage, null);
  assert.equal(grid.source, 'grid');
  assert.equal(grid.source_url, null);
  const tba = db.prepare('SELECT name FROM bands WHERE id=?').get('tba');
  assert.equal(tba.name, 'Live bands all day');

  assert.equal(db.prepare('SELECT id FROM sets WHERE id=?').get('2026-11-17-legends-2-x2'), undefined);
  const future = db.prepare('SELECT band_id,source,set_start FROM sets WHERE id=?').get('2026-11-18-roberts-1');
  assert.equal(future.band_id, 'tba');
  assert.equal(future.source, 'grid');
  assert.equal(future.set_start, '14:00');

  const manual = db.prepare('SELECT band_id,source,stage FROM sets WHERE id=?').get('2026-11-17-bootbarn-2');
  assert.equal(manual.band_id, 'act_kept');
  assert.equal(manual.source, 'manual');
  assert.equal(manual.stage, 'Rooftop');
  const owner = db.prepare('SELECT band_id,source FROM sets WHERE id=?').get('2026-11-17-tootsies-2');
  assert.equal(owner.band_id, 'act_owner');
  assert.equal(owner.source, 'owner');
  const rated = db.prepare('SELECT band_id,source FROM sets WHERE id=?').get('2026-11-17-luke32-2-x-rated');
  assert.equal(rated.band_id, 'act_rated');
  assert.equal(rated.source, 'nmc');
  const past = db.prepare('SELECT band_id,source,set_start FROM sets WHERE id=?').get('2026-11-16-legends-2');
  assert.equal(past.band_id, 'act_scraped');
  assert.equal(past.source, 'nmc');
  assert.equal(past.set_start, '18:45');
  const bar = db.prepare('SELECT band_id,source FROM sets WHERE id=?').get('2026-11-17-acme-0');
  assert.equal(bar.band_id, 'act_bar');
  assert.equal(bar.source, 'bar');

  assert.equal(L.purgeRetiredListings('2026-11-17'), 0);
});

test('roberts, legends, and the stage no longer scrape the retired calendar, and luke32 keeps its own page', () => {
  assert.equal(SRC.SOURCES.roberts, undefined);
  assert.equal(SRC.SOURCES.legends, undefined);
  assert.equal(SRC.SOURCES.bootbarn, undefined);
  assert.deepEqual(SRC.SOURCES.luke32, [{ type: 'lukes', url: 'https://lukes32bridge.com/live-music/' }]);
  assert.equal(SRC.P.nmc, undefined);
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /Listings from bars, artists and bar owners/);
  assert.equal(/nashvillemusiccalendar/i.test(html), false);
});

test.after(() => {
  try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-wal'); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-shm'); } catch (e) {}
});
