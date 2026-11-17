// Shared live-band checks for the API and the client.
// DJ, karaoke, trivia, and other non-band events stay in the database; they are just hidden.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LiveBand = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function nameOf(bandOrSet) {
    if (bandOrSet && typeof bandOrSet === 'object') {
      return bandOrSet.band || bandOrSet.name;
    }
    return bandOrSet;
  }

  function normName(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function isTba(bandOrSet) {
    if (bandOrSet && typeof bandOrSet === 'object' && bandOrSet.band_id === 'tba') return true;
    const n = normName(nameOf(bandOrSet));
    if (!n) return true;
    if (/\btba\b/.test(n) || /\btbd\b/.test(n)) return true;
    if (n === 'live music' || n === 'live band') return true;
    if (/^live music\b/.test(n)) return true;
    if (/^live bands?\b/.test(n)) return true;
    return false;
  }

  // DJ sets, karaoke, trivia, and similar non-band events. "DJ" alone also counts.
  function isNonBand(bandOrSet) {
    const n = normName(nameOf(bandOrSet));
    if (!n) return false;
    if (n === 'dj' || n.startsWith('dj ')) return true;
    if (n.includes(' dj ')) return true;
    if (/\bkaraoke\b/.test(n)) return true;
    if (/\btrivia\b/.test(n)) return true;
    if (/\bhome game\b/.test(n)) return true;
    return false;
  }

  function isLiveBand(bandOrSet) {
    return !isTba(bandOrSet) && !isNonBand(bandOrSet);
  }

  function hideNonBands(list) {
    return (list || []).filter(s => !isNonBand(s));
  }

  function namedLiveSets(list) {
    return (list || []).filter(s => isLiveBand(s));
  }

  return {
    nameOf,
    normName,
    isTba,
    isNonBand,
    isLiveBand,
    hideNonBands,
    namedLiveSets
  };
});
