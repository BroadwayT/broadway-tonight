const test = require('node:test');
const assert = require('node:assert/strict');
const LB = require('../public/live-band');

test('flags DJ, karaoke, trivia, and home-game names as non-band', () => {
  assert.equal(LB.isNonBand('DJ'), true);
  assert.equal(LB.isNonBand('DJ Chip The Love Dip'), true);
  assert.equal(LB.isNonBand({ name: 'DJ Road' }), true);
  assert.equal(LB.isNonBand('Open Format DJ Set'), true);
  assert.equal(LB.isNonBand('Karaoke Night'), true);
  assert.equal(LB.isNonBand('Tuesday Trivia'), true);
  assert.equal(LB.isNonBand('TITANS HOME GAME'), true);
  assert.equal(LB.isNonBand('Joe Barron'), false);
  assert.equal(LB.isNonBand('Matt Poling'), false);
  assert.equal(LB.isNonBand('Live music (TBA)'), false);
});

test('isTba covers placeholders and empty names, including band_id', () => {
  assert.equal(LB.isTba('Live music (TBA)'), true);
  assert.equal(LB.isTba('live band'), true);
  assert.equal(LB.isTba('live music'), true);
  assert.equal(LB.isTba(''), true);
  assert.equal(LB.isTba({ band_id: 'tba', band: 'Anything' }), true);
  assert.equal(LB.isTba('Joe Barron'), false);
  assert.equal(LB.isTba('DJ'), false);
});

test('isLiveBand is a named live act, not TBA and not a DJ', () => {
  assert.equal(LB.isLiveBand('Joe Barron'), true);
  assert.equal(LB.isLiveBand('Phillips Family Electric'), true);
  assert.equal(LB.isLiveBand('DJ'), false);
  assert.equal(LB.isLiveBand('Live music (TBA)'), false);
  assert.equal(LB.isLiveBand({ band_id: 'tba', band: 'Live music (TBA)' }), false);
});

test('hideNonBands keeps TBA rows and drops DJ rows', () => {
  const rows = [
    { band: 'Matt Poling' },
    { band: 'DJ Road' },
    { band: 'Live music (TBA)', band_id: 'tba' },
    { band: 'TITANS HOME GAME' },
    { name: 'Karaoke' }
  ];
  assert.deepEqual(LB.hideNonBands(rows).map(s => s.band || s.name), [
    'Matt Poling',
    'Live music (TBA)'
  ]);
});

test('a bar whose only named sets are DJs has no named live sets', () => {
  const rows = [
    { band: 'DJ Chip The Love Dip', set_start: '12:00' },
    { band: 'Live music (TBA)', band_id: 'tba', set_start: '18:00' }
  ];
  assert.deepEqual(LB.namedLiveSets(rows), []);
  assert.equal(LB.hideNonBands(rows).length, 1);
  assert.equal(LB.hideNonBands(rows)[0].band_id, 'tba');
});

test('Posty today keeps the four live bands and hides the three DJs', () => {
  const rows = [
    { band: 'Matt Poling', set_start: '10:00' },
    { band: 'Phillips Family Electric', set_start: '14:00' },
    { band: 'DJ Road', set_start: '14:00' },
    { band: 'Brian Thomas', set_start: '18:00' },
    { band: 'DJ Travie', set_start: '18:00' },
    { band: 'No Good Deed Band', set_start: '22:00' },
    { band: 'DJ Mason Edwards', set_start: '22:00' }
  ];
  assert.deepEqual(LB.namedLiveSets(rows).map(s => s.band), [
    'Matt Poling',
    'Phillips Family Electric',
    'Brian Thomas',
    'No Good Deed Band'
  ]);
});
