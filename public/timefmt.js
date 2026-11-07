// Display-only clock formatting. Stored set times stay as scraped/typed
// (24h "20:00", or already "8pm"). Sorting and "playing now" keep using the raw values.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TimeFmt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function parseClock(raw) {
    if (raw == null) return null;
    const s = String(raw).trim().replace(/[\u202f\u00a0]/g, ' ').replace(/\s+/g, ' ');
    if (!s) return null;
    let h, min = 0, sec = 0;
    const withAp = s.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i);
    if (withAp) {
      h = +withAp[1];
      min = withAp[2] ? +withAp[2] : 0;
      sec = withAp[3] ? +withAp[3] : 0;
      if (h < 1 || h > 12 || min > 59 || sec > 59) return null;
      if (h === 12) h = 0;
      if (withAp[4].toLowerCase() === 'p') h += 12;
      return { h, min };
    }
    const plain = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!plain) return null;
    h = +plain[1];
    min = +plain[2];
    sec = plain[3] ? +plain[3] : 0;
    if (min > 59 || sec > 59) return null;
    if (h === 24 && min === 0 && sec === 0) return { h: 0, min: 0 };
    if (h > 23) return null;
    return { h, min };
  }

  function clockText(p, withMeridiem) {
    let h = p.h % 12;
    if (h === 0) h = 12;
    const body = p.min ? h + ':' + String(p.min).padStart(2, '0') : String(h);
    if (!withMeridiem) return body;
    return body + ' ' + (p.h < 12 ? 'AM' : 'PM');
  }

  // "8 PM", "8:30 PM", "11 AM". Unparseable text is returned unchanged.
  function formatTime(raw) {
    const p = parseClock(raw);
    if (!p) return raw == null || String(raw).trim() === '' ? '' : String(raw).trim();
    return clockText(p, true);
  }

  // "8–11 PM" when the meridiem matches, "10 PM–2 AM" when it changes. No ":00".
  function formatRange(start, end) {
    const a = parseClock(start), b = parseClock(end);
    if (a && b) {
      const same = (a.h < 12) === (b.h < 12);
      return (same ? clockText(a, false) : clockText(a, true)) + '\u2013' + clockText(b, true);
    }
    const fa = a ? clockText(a, true) : (start == null || String(start).trim() === '' ? '' : String(start).trim());
    const fb = b ? clockText(b, true) : (end == null || String(end).trim() === '' ? '' : String(end).trim());
    if (fa && fb) return fa + '\u2013' + fb;
    return fa || fb;
  }

  return { formatTime, formatRange };
});
