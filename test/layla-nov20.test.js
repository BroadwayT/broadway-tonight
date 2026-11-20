const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(os.tmpdir(), 'bt-layla-nov20-' + process.pid + '.db');

const db = require('../db');
const BARS = require('../bars');
const L = require('../lineup');
const MANUAL = require('../manual-sets.json');
const ENGAGED = require('../social/stories/engaged.json');

BARS.upsertBars(db);

const SOURCE = 'instagram.com/laylasnashville post, Nov 19 2026';
const DATES = ['2026-11-20', '2026-11-21', '2026-11-22'];
const EXPECTED = {
  '2026-11-20': [
    ['Karen Pendley', '10:30', '14:00'],
    ['Russell Brown', '14:00', '18:00'],
    ['Brett Strader', '18:00', '22:00'],
    ['Los Honky Tonkers', '22:00', '02:30']
  ],
  '2026-11-21': [
    ['Karen Pendley', '10:30', '14:00'],
    ['Russell Brown', '14:00', '18:00'],
    ['Addison Simmons', '18:00', '22:00'],
    ['Kyler Sullivan', '22:00', '02:30']
  ],
  '2026-11-22': [
    ['The Risches', '10:30', '14:00'],
    ['Addison Simmons', '14:00', '18:00'],
    ['David Graham', '18:00', '22:00'],
    ['Kyler Sullivan', '22:00', '02:30']
  ]
};

function rows(date) {
  return db.prepare("SELECT s.id,s.band_id,s.set_start,s.set_end,s.stage,s.source,b.name band FROM sets s JOIN bands b ON b.id=s.band_id WHERE s.bar_id='layla' AND s.date=? ORDER BY s.set_start,s.id").all(date);
}

function isPlaceholder(r) {
  const name = String(r.band || '').trim();
  return r.band_id === 'tba' || r.source === 'grid' || name === '' || name === 'Live bands all day';
}

function seedTba() {
  const ins = db.prepare('INSERT OR REPLACE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,stage) VALUES(?,?,?,?,?,?,?,?,?)');
  const slots = [['10:00', '14:00'], ['14:00', '18:00'], ['18:00', '22:00'], ['22:00', '02:00']];
  for (const date of DATES) {
    slots.forEach((s, i) => ins.run(`${date}-layla-${i}`, 'layla', 'tba', date, s[0], s[1], `${date}-slot${i}`, 'grid', null));
  }
}

test('manual-sets.json lists Layla Nov 20-22 from the Instagram post, with overnight sets on the start night', () => {
  const listed = (MANUAL.sets || []).filter(m => m.bar === 'layla' && DATES.includes(m.date));
  assert.equal(listed.length, 12, JSON.stringify(listed));
  for (const date of DATES) {
    const day = listed.filter(m => m.date === date);
    assert.deepEqual(day.map(m => [m.band, m.start, m.end]), EXPECTED[date]);
    for (const m of day) {
      assert.equal(m.stage, null);
      assert.equal(m.source, SOURCE);
      assert.equal(/nashvillelineup\.com|nashvillemusiccalendar\.com/i.test(m.source), false);
      assert.equal(!m.band || m.band === 'Live bands all day', false);
    }
  }
  const keys = listed.map(m => m.date + '|' + m.band + '|' + m.start);
  assert.equal(new Set(keys).size, keys.length);
});

test('applyManual replaces Live bands all day Layla rows for Nov 20-22 and does not duplicate', () => {
  seedTba();
  L.applyManual('2026-11-20');
  const first = {};
  for (const date of DATES) {
    const list = rows(date);
    assert.equal(list.some(isPlaceholder), false, date + ' ' + JSON.stringify(list));
    assert.deepEqual(list.map(r => [r.band, r.set_start, r.set_end, r.stage, r.source]), EXPECTED[date].map(([band, start, end]) => [band, start, end, null, 'manual']));
    assert.deepEqual(list.map(r => r.id), [0, 1, 2, 3].map(i => date + '-layla-' + i));
    const late = list.find(r => r.set_start === '22:00');
    assert.equal(late.set_end, '02:30');
    first[date] = list.map(r => r.id);
  }
  L.applyManual('2026-11-20');
  for (const date of DATES) {
    const list = rows(date);
    assert.equal(list.length, 4, JSON.stringify(list));
    assert.deepEqual(list.map(r => r.id), first[date]);
    assert.equal(list.some(isPlaceholder), false);
  }
});

test('engaged bars keep JBJ\'s and add Layla with the tag note', () => {
  assert.deepEqual(ENGAGED.bars, ['jbjs', 'layla']);
  assert.equal(ENGAGED._sources.layla, '@laylasnashville tagged @broadwaytonightnash in their Nov 19 2026 weekend lineup post.');
  assert.match(ENGAGED._sources.bars, /JBJ's Nashville/);
});

test.after(() => {
  try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-wal'); } catch (e) {}
  try { fs.unlinkSync(process.env.DB_PATH + '-shm'); } catch (e) {}
});
