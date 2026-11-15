const test = require('node:test');
const assert = require('node:assert/strict');
const Share = require('../public/share-lineup');

const picks = {
  barOfTheWeek: { barId: 'postys', name: "Post Malone's Posty's" },
  bandSpotlight: { name: 'Joe Barron', slug: 'joe-barron' },
  hotRightNow: { barId: 'bootbarn', band: 'Conner Sweet Band' }
};

function set(partial) {
  return Object.assign({
    id: partial.id || (partial.bar_id + '-' + partial.set_start + '-' + (partial.band || 'x')),
    date: '2026-11-15',
    stage: null,
    engaged: false
  }, partial);
}

const sets = [
  set({ bar_id: 'ajs', bar: "AJ's Good Time Bar", band: 'Russell Brown', set_start: '11:00', set_end: '14:00' }),
  set({ bar_id: 'ajs', bar: "AJ's Good Time Bar", band: 'The Bruisers', set_start: '14:00', set_end: '18:00' }),
  set({ bar_id: 'acme', bar: 'Acme Feed & Seed', band: 'Live music (TBA)', set_start: '14:00', set_end: '18:00' }),
  set({ bar_id: 'acme', bar: 'Acme Feed & Seed', band: 'Timbo', set_start: '18:00', set_end: '21:00' }),
  set({ bar_id: 'thisbar', bar: "Morgan Wallen's This Bar & Tennessee Kitchen", band: 'Bear Redell', set_start: '14:00', set_end: '17:00' }),
  set({ bar_id: 'thisbar', bar: "Morgan Wallen's This Bar & Tennessee Kitchen", band: 'Joe Barron', set_start: '16:00', set_end: '19:00', bandSlug: 'joe-barron', engaged: true }),
  set({ bar_id: 'thisbar', bar: "Morgan Wallen's This Bar & Tennessee Kitchen", band: 'Joe Barron', set_start: '18:00', set_end: '22:00', stage: 'Rooftop Stage', bandSlug: 'joe-barron', engaged: true }),
  set({ bar_id: 'bootbarn', bar: 'The Stage on Broadway', band: 'Conner Sweet Band', set_start: '14:45', set_end: '18:15' }),
  set({ bar_id: 'postys', bar: "Post Malone's Posty's", band: 'Phillips Family Electric', set_start: '14:00', set_end: '17:00' }),
  set({ bar_id: 'postys', bar: "Post Malone's Posty's", band: 'Brian Thomas', set_start: '18:00', set_end: '21:00' }),
  set({ bar_id: 'tootsies', bar: "Tootsie's Orchid Lounge", band: 'Rod Jansen', set_start: '14:00', set_end: '18:00' }),
  set({ bar_id: 'tootsies', bar: "Tootsie's Orchid Lounge", band: 'David Ray', set_start: '18:00', set_end: '22:00' }),
  set({ bar_id: 'tootsies', bar: "Tootsie's Orchid Lounge", band: 'Ricky Rouix', set_start: '22:00', set_end: '02:00' })
];

// Sunday Nov 15, 2026 times in Central (CST, UTC-6)
const AT = {
  '2pm': Date.parse('2026-11-15T14:00:00-06:00'),
  '7pm': Date.parse('2026-11-15T19:00:00-06:00'),
  '1030pm': Date.parse('2026-11-15T22:30:00-06:00'),
  '1230am': Date.parse('2026-11-16T00:30:00-06:00')
};

function bandsAt(when) {
  return Share.pickSets(sets, { now: AT[when], picks }).map(r => r.set.band + ' @ ' + Share.shortBarName(r.set) + ' ' + r.status);
}

test('skips TBA and live music rows', () => {
  assert.equal(Share.isTba('Live music (TBA)'), true);
  assert.equal(Share.isTba('live band'), true);
  assert.equal(Share.isTba('Timbo'), false);
  const picked = Share.pickSets(sets, { now: AT['2pm'], picks });
  assert.ok(!picked.some(r => /tba|live music/i.test(r.set.band)));
});

test('keeps one set per bar', () => {
  const picked = Share.pickSets(sets, { now: AT['2pm'], picks });
  const bars = picked.map(r => r.set.bar_id);
  assert.equal(bars.length, new Set(bars).size);
});

test('at 2 PM CT leads with Joe Barron even though his set is later', () => {
  const text = Share.build(sets, { now: AT['2pm'], picks });
  const lines = text.split('\n');
  assert.equal(lines[0], 'Tonight on Lower Broadway');
  assert.equal(lines[1], 'Joe Barron, This Bar, 4 PM');
  assert.ok(text.includes('Conner Sweet Band, The Stage, 2:45 PM'));
  assert.ok(text.includes("Phillips Family Electric, Posty's, 2 PM"));
  assert.ok(!text.includes('Live music'));
  assert.ok(!text.includes('\u2013'));
  assert.ok(!text.includes('\u2014'));
  assert.ok(!text.includes('!'));
  assert.ok(text.endsWith('Full lineup: broadwaytonightnash.com'));
  assert.match(text, /\+ \d+ more bands tonight/);
});

test('at 7 PM CT Joe is still listed and finished afternoon sets are not', () => {
  const picked = Share.pickSets(sets, { now: AT['7pm'], picks });
  const joe = picked.find(r => r.set.band === 'Joe Barron');
  assert.ok(joe);
  assert.equal(joe.set.set_start, '18:00');
  assert.equal(joe.set.stage, 'Rooftop Stage');
  assert.ok(!picked.some(r => r.set.band === 'Conner Sweet Band'));
  assert.ok(!picked.some(r => r.set.band === 'The Bruisers'));
  const postys = picked.find(r => r.set.bar_id === 'postys');
  assert.equal(postys.set.band, 'Brian Thomas');
});

test('at 10:30 PM CT skips ended featured sets and keeps late sets past midnight', () => {
  const picked = Share.pickSets(sets, { now: AT['1030pm'], picks });
  assert.ok(!picked.some(r => r.set.band === 'Joe Barron'));
  const toots = picked.find(r => r.set.bar_id === 'tootsies');
  assert.equal(toots.set.band, 'Ricky Rouix');
  assert.equal(toots.status, 'now');
});

test('after midnight still treats an overnight set as now', () => {
  const picked = Share.pickSets(sets, { now: AT['1230am'], picks });
  const toots = picked.find(r => r.set.bar_id === 'tootsies');
  assert.equal(toots.set.band, 'Ricky Rouix');
  assert.equal(toots.status, 'now');
});

test('uses 12-hour times and a compact bar name', () => {
  assert.equal(Share.formatLine(sets.find(s => s.band === 'Conner Sweet Band')), 'Conner Sweet Band, The Stage, 2:45 PM');
  assert.equal(Share.shortBarName({ bar_id: 'thisbar', bar: "Morgan Wallen's This Bar & Tennessee Kitchen" }), 'This Bar');
});

test('lists 5 bands by default', () => {
  assert.equal(Share.LIMIT, 5);
  const picked = Share.pickSets(sets, { now: AT['2pm'], picks });
  assert.equal(picked.length, 5);
});

test('counts unique named bands not listed', () => {
  const text = Share.build(sets, { now: AT['2pm'], picks, limit: 3 });
  // Unique named (non-TBA) bands in the fixture: Russell Brown, The Bruisers, Timbo,
  // Bear Redell, Joe Barron, Conner Sweet Band, Phillips Family Electric, Brian Thomas,
  // Rod Jansen, David Ray, Ricky Rouix = 11. Limit 3 leaves 8 more.
  assert.ok(text.includes('+ 8 more bands tonight'));
});

test('skips DJ, karaoke, trivia, and home-game sets and leaves them out of the count', () => {
  assert.equal(Share.isNonBand('DJ'), true);
  assert.equal(Share.isNonBand('DJ Chip The Love Dip'), true);
  assert.equal(Share.isNonBand('Open Format DJ Set'), true);
  assert.equal(Share.isNonBand('Karaoke Night'), true);
  assert.equal(Share.isNonBand('Tuesday Trivia'), true);
  assert.equal(Share.isNonBand('TITANS HOME GAME'), true);
  assert.equal(Share.isNonBand('Joe Barron'), false);
  assert.equal(Share.isLiveBand('DJ'), false);
  assert.equal(Share.isLiveBand('Live music (TBA)'), false);
  assert.equal(Share.isLiveBand('Joe Barron'), true);

  const extra = sets.concat([
    set({ bar_id: 'luckybastard', bar: 'Lucky Bastard Saloon', band: 'DJ Chip The Love Dip', set_start: '12:00', set_end: '20:00' }),
    set({ bar_id: 'olered', bar: "Blake Shelton's Ole Red Nashville", band: 'TITANS HOME GAME', set_start: '10:00', set_end: '15:00' }),
    set({ bar_id: 'nudies', bar: "Nudie's Honky Tonk", band: 'Karaoke', set_start: '18:00', set_end: '22:00' }),
    set({ bar_id: 'aldeans', bar: "Jason Aldean's Kitchen + Rooftop", band: 'Tuesday Trivia', set_start: '14:00', set_end: '16:00' }),
    set({ bar_id: 'postys', bar: "Post Malone's Posty's", band: 'DJ Road', set_start: '14:00', set_end: '17:00' })
  ]);
  const picked = Share.pickSets(extra, { now: AT['2pm'], picks });
  assert.ok(!picked.some(r => Share.isNonBand(r.set.band)));
  const text = Share.build(extra, { now: AT['2pm'], picks, limit: 3 });
  assert.ok(!/DJ |Karaoke|Trivia|HOME GAME/i.test(text));
  // Unique live bands are still the 11 named bands from the base fixture.
  // Limit 3 leaves 8 more. The DJ, karaoke, trivia, and home-game names do not add to the count.
  assert.ok(text.includes('+ 8 more bands tonight'));
});
