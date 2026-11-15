// Share lineup text for the "Share lineup" button.
// Picks named live-band sets that are on now or up next, one per bar, and leads with
// Band of the Week, Hot Right Now, engaged bands, and Bar of the Week.
// DJ, karaoke, trivia, and other non-band events are left out of the list and the count.
(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./timefmt') : (root && root.TimeFmt));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ShareLineup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TF) {
  'use strict';

  const LIMIT = 5;
  const SITE = 'broadwaytonightnash.com';
  const TZ = 'America/Chicago';

  // Compact names so a text message can list more bars.
  const SHORT_BARS = {
    acme: 'Acme',
    wildhorse: 'Category 10',
    chiefs: "Chief's",
    bootleggers: 'Bootleggers',
    redneckriviera: 'Redneck Riviera',
    goodnight: 'Goodnight Nashville',
    kidrock: "Kid Rock's",
    bellbottomsup: 'Bell Bottoms Up',
    olered: 'Ole Red',
    luke32: "Luke's 32 Bridge",
    postys: "Posty's",
    whiskeybent: 'Whiskey Bent',
    aldeans: "Aldean's",
    casarosa: 'Casa Rosa',
    kanebrown: "Kane Brown's",
    tinroof: 'Tin Roof',
    margaritaville: 'Margaritaville',
    honkytonkcentral: 'Honky Tonk Central',
    thisbar: 'This Bar',
    whiskeyrow: 'Whiskey Row',
    jbjs: "JBJ's",
    luckybastard: 'Lucky Bastard',
    nudies: "Nudie's",
    flp: 'Friends in Low Places',
    bootbarn: 'The Stage',
    roberts: "Robert's",
    layla: "Layla's",
    boogiebar: 'Boogie Bar',
    ajs: "AJ's",
    tootsies: "Tootsie's",
    legends: 'Legends Corner',
    rippys: "Rippy's"
  };

  function isTba(band) {
    const n = String(band || '').trim().toLowerCase();
    if (!n) return true;
    if (/\btba\b/.test(n) || /\btbd\b/.test(n)) return true;
    if (n === 'live music' || n === 'live band') return true;
    if (/^live music\b/.test(n)) return true;
    return false;
  }

  // DJ sets, karaoke, trivia, and similar non-band events. "DJ" alone also counts.
  function isNonBand(band) {
    const n = normName(band);
    if (!n) return false;
    if (n === 'dj' || n.startsWith('dj ')) return true;
    if (n.includes(' dj ')) return true;
    if (/\bkaraoke\b/.test(n)) return true;
    if (/\btrivia\b/.test(n)) return true;
    if (/\bhome game\b/.test(n)) return true;
    return false;
  }

  function isLiveBand(band) {
    return !isTba(band) && !isNonBand(band);
  }

  function shortBarName(set) {
    const id = String((set && set.bar_id) || '').toLowerCase();
    if (SHORT_BARS[id]) return SHORT_BARS[id];
    return String((set && set.bar) || '').trim() || 'Broadway';
  }

  function normName(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // Minutes from 6 AM, so 1 AM is after 10 PM. Matches server nightKey.
  function nightKey(raw) {
    const s = String(raw == null ? '' : raw).trim().replace(/[\u202f\u00a0]/g, ' ');
    if (!s) return null;
    let h, min = 0;
    const ap = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i);
    if (ap) {
      h = +ap[1];
      min = ap[2] ? +ap[2] : 0;
      if (h < 1 || h > 12 || min > 59) return null;
      if (h === 12) h = 0;
      if (ap[3].toLowerCase() === 'p') h += 12;
    } else {
      const plain = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (!plain) return null;
      h = +plain[1];
      min = +plain[2];
      if (h > 23 || min > 59) return null;
    }
    return ((h < 6 ? h + 24 : h) * 60) + min;
  }

  function chicagoHM(now) {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date(now));
    const h = p.find(x => x.type === 'hour').value.padStart(2, '0');
    const m = p.find(x => x.type === 'minute').value.padStart(2, '0');
    return h + ':' + m;
  }

  function endKeyOf(startKey, endRaw) {
    if (startKey == null) return null;
    const e = nightKey(endRaw);
    if (e == null) return startKey + 180;
    return e <= startKey ? e + 24 * 60 : e;
  }

  function statusOf(nowKey, startRaw, endRaw) {
    const startKey = nightKey(startRaw);
    if (nowKey == null || startKey == null) return 'unknown';
    const endKey = endKeyOf(startKey, endRaw);
    if (nowKey >= endKey) return 'past';
    if (nowKey >= startKey) return 'now';
    return 'later';
  }

  function flagsFor(set, picks) {
    picks = picks || {};
    const spot = picks.bandSpotlight || {};
    const hot = picks.hotRightNow || {};
    const week = picks.barOfTheWeek || {};
    const band = normName(set.band);
    const slug = String(set.bandSlug || set.slug || '').toLowerCase();
    const spotSlug = String(spot.slug || '').toLowerCase();
    const spotlight = !!(band && band === normName(spot.name)) || !!(slug && spotSlug && slug === spotSlug);
    const hotBand = !!(band && band === normName(hot.band));
    const barWeek = !!(set.bar_id && week.barId && set.bar_id === week.barId);
    const engaged = !!set.engaged;
    return { spotlight, hot: hotBand, barWeek, engaged };
  }

  function isFeatured(flags) {
    return !!(flags && (flags.spotlight || flags.hot || flags.engaged || flags.barWeek));
  }

  function setScore(status, flags) {
    let n = 0;
    if (flags.spotlight) n += 80;
    if (flags.hot) n += 70;
    if (flags.engaged) n += 60;
    if (flags.barWeek) n += 40;
    if (status === 'now') n += 20;
    return n;
  }

  function pack(set, nowKey, picks) {
    const status = statusOf(nowKey, set.set_start, set.set_end);
    const flags = flagsFor(set, picks);
    const startKey = nightKey(set.set_start);
    return {
      set,
      status,
      flags,
      startKey,
      endKey: endKeyOf(startKey, set.set_end),
      score: setScore(status, flags)
    };
  }

  function betterPack(a, b) {
    if (a.score !== b.score) return a.score > b.score;
    if (a.status !== b.status) return a.status === 'now';
    if (a.status === 'now') {
      if (a.endKey !== b.endKey) return a.endKey > b.endKey;
      if (a.startKey !== b.startKey) return a.startKey > b.startKey;
    } else if (a.startKey !== b.startKey) {
      return a.startKey < b.startKey;
    }
    const aStage = a.set.stage ? 1 : 0;
    const bStage = b.set.stage ? 1 : 0;
    if (aStage !== bStage) return aStage < bStage;
    return String(a.set.id || '') < String(b.set.id || '');
  }

  function featureRank(flags) {
    if (flags.spotlight) return 0;
    if (flags.hot) return 1;
    if (flags.engaged) return 2;
    if (flags.barWeek) return 3;
    return 4;
  }

  function pickSets(sets, opts) {
    opts = opts || {};
    const limit = opts.limit == null ? LIMIT : Math.max(0, opts.limit);
    const nowKey = nightKey(chicagoHM(opts.now == null ? Date.now() : opts.now));
    const picks = opts.picks || {};
    const byBar = new Map();
    for (const set of sets || []) {
      if (!isLiveBand(set && set.band)) continue;
      const row = pack(set, nowKey, picks);
      if (row.status !== 'now' && row.status !== 'later') continue;
      const barId = set.bar_id || set.bar || ('bar-' + byBar.size);
      const prev = byBar.get(barId);
      if (!prev || betterPack(row, prev)) byBar.set(barId, row);
    }

    const must = [];
    const nowRows = [];
    const laterRows = [];
    for (const row of byBar.values()) {
      if (isFeatured(row.flags)) must.push(row);
      else if (row.status === 'now') nowRows.push(row);
      else laterRows.push(row);
    }
    must.sort((a, b) => featureRank(a.flags) - featureRank(b.flags) || a.startKey - b.startKey || String(a.set.band).localeCompare(String(b.set.band)));
    nowRows.sort((a, b) => b.startKey - a.startKey || b.endKey - a.endKey || String(a.set.band).localeCompare(String(b.set.band)));
    laterRows.sort((a, b) => a.startKey - b.startKey || String(a.set.band).localeCompare(String(b.set.band)));

    const chosen = [];
    const usedBars = new Set();
    function take(list) {
      for (const row of list) {
        if (chosen.length >= limit) return;
        const barId = row.set.bar_id || row.set.bar;
        if (usedBars.has(barId)) continue;
        usedBars.add(barId);
        chosen.push(row);
      }
    }
    take(must);
    take(nowRows);
    take(laterRows);
    return chosen;
  }

  function formatLine(set) {
    const time = TF && TF.formatTime ? TF.formatTime(set.set_start) : String(set.set_start || '');
    return set.band + ', ' + shortBarName(set) + ', ' + time;
  }

  function uniqueNamedBands(sets) {
    const names = new Set();
    for (const set of sets || []) {
      if (!isLiveBand(set && set.band)) continue;
      const n = normName(set.band);
      if (n) names.add(n);
    }
    return names;
  }

  function build(sets, opts) {
    opts = opts || {};
    const chosen = pickSets(sets, opts);
    const lines = chosen.map(row => formatLine(row.set));
    const listed = new Set(chosen.map(row => normName(row.set.band)).filter(Boolean));
    const more = Math.max(0, uniqueNamedBands(sets).size - listed.size);
    const site = String(opts.site || SITE).replace(/^https?:\/\//, '').replace(/\/.*$/, '') || SITE;
    const out = ['Tonight on Lower Broadway'];
    if (lines.length) out.push(lines.join('\n'));
    if (more > 0) out.push('+ ' + more + ' more bands tonight');
    out.push('Full lineup: ' + site);
    return out.join('\n');
  }

  return {
    LIMIT,
    SITE,
    isTba,
    isNonBand,
    isLiveBand,
    shortBarName,
    nightKey,
    chicagoHM,
    pickSets,
    formatLine,
    build
  };
});
