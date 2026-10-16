# STATUS — 2026-10-15
## Built
- Express + better-sqlite3 (native build OK), DB at data/app.db; single-file mobile UI.
- Seed: 10 Lower Broadway honky-tonks, 40 sets (4h slots 10a/2p/6p/10p CT), 20 sample bands, ~200 fake ratings incl. tonight data for 6 bars, past-night top-5 history for streaks. No scraping.
- Scoring (scoring.js): Bayesian prior 3.5, C=20; Tonight = last 6h, w=0.5^(h/3), + min(0.5, 0.1·ln(1+unique check-in devices)); Week = last 7d, w=0.5^(h/24) (+ optional capped boost); Streak = consecutive CT nights in top 5, one miss resets, tie-break Week.
- Anti-gaming: device_id cookie; UNIQUE(device,bar,band,set_window); 3/hour and 10/night per device (429); ip sha256-hashed on receipt, ≥3 ratings from same ip_hash in 1h → stored but soft-hidden from scores; Tonight score hidden when N<5 ("Not enough ratings yet"); spike flag (N doubles <30 min or avg +1.0 vs prior hour) → review_queue.
- Sponsored Featured Tonight: Wildhorse Saloon hardcoded for tonight, gold "SPONSORED" card above organic board, from a separate sponsors table; never touches scores.
## Running
- http://127.0.0.1:3847/ (localhost only, nohup node server.js, log data/server.log). Not deployed publicly.
## Verified
- Acceptance: Legends (3×5★) hidden/unranked; Robert's (40×4★) = 4.04 and ranked. Live rating of Acme accepted, duplicate → 409, N went 7→8 and score updated.
## Decisions
- "Night" = CT calendar day shifted −3h (so 1 AM ratings count to the prior night; matches 3 AM snapshot). Snapshot job writes daily top 5 during the 2–3 AM CT hour.
- Check-in is a self-reported checkbox (no geo yet); stage photo not built.
- Caps keyed by device (no accounts in MVP). N≥5 uses raw count, not weighted.
- Leaderboards cached 60s (spec: Tonight 1–5 min; Week is 1 min not hourly for demo); cache cleared on each new rating.
- No device_fingerprint yet (ip_hash only). Sponsor pricing tiers are a label only; no billing.
## Blockers
- None. Next: real scraper, geo check-in, admin UI for review queue + sponsors, accounts.
## Lineups — real data (2026-10-15, CT night)
Source: nashvillemusiccalendar.com/neighborhood/lower-broadway/ (fetched 10/15 evening; barsonbroadway.com/schedule/ was stale, only showed 10/16). Updated surgically: only the 18:00 slot (slot2) set's band_id + start time; ratings on those sets retagged to the new band (none deleted). Backup: data/app.db.bak-lineups.
- REAL: roberts 6:30 PM Kelley's Heroes; legends 6:45 PM Luke Maurer; bootbarn (The Stage) 6:45 PM Jered Ames / Mike Kindel; aldeans 6:00 PM Ariel McReynolds / Nick Walker.
- PLACEHOLDER (sample band names, not real): all slot0/1/3 sets for every bar; all sets for tootsies, layla, acme, wildhorse, honkytonkcentral, luke32 (not listed on source for tonight).

## Owner magic links
- Each bar has a private no-login link: `/owner/:token` (phone page `public/owner.html`) to edit tonight's 4 band names/start times + contact email/phone.
- API: `GET/POST /api/owner/:token`. Tables: `owner_tokens`, `owner_contacts`.
- Links per bar: `data/owner-links.txt` (generate/refresh with `node scripts/owner-tokens.js`; tokens are stable). Use as {{OWNER_LINK}} in docs/outreach-bars.md.

## Competitive upgrade (2026-10-15 evening)
Targeted gaps vs Bars on Broadway / MusicSource (schedules + maps + cams; weak on live guest signal): we doubled down on *right now* + crowd proof + phone actions.

Shipped on localhost :3847 (no new accounts, ratings/Hot/owner links intact):
- **Now Playing** — `GET /api/now` + horizontal LIVE strip (CT set windows, overnight-aware)
- **Walk the Strip** — `GET /api/street` river→5th order, hot-score dots, pulse + last-call hints
- **Social proof ticker** — `GET /api/pulse` (1h if any, else 6h real counts)
- **Band search** — `GET /api/search?q=` on Lineup tab
- **Share** — Web Share API / clipboard on bar pages
- **Tonight Plan** — localStorage shortlist (max 3), sticky bar
- **PWA-ish** — `manifest.webmanifest`, icons, Add to Home hint
- Crowd pulse amplified on street + bar detail (vibe · n); open-late from last `set_end`

Deferred: side-by-side compare UI, live cams/wait times, GPS check-in, public tunnel, push notifications.

## Night rollover (2026-10-16 07:51 UTC)
- Created full 2026-10-16 set grid (40 slots) so app stays populated after 3 AM CT night flip.
- REAL morning (from nashvillemusiccalendar.com Lower Broadway, fetched this wake): roberts Joshua Hedley & The Hedliners; legends The Taylors; bootbarn Samantha Stroh / The John Tocco Band; aldeans Ashley Christensen / Johnny Cochran.
- Other 2026-10-16 slots remain placeholder band names until evening listings firm up or owners edit via magic links.
- Sponsor: wildhorse Featured for 2026-10-16.
- 2026-10-16 11:05 UTC: luke32 10 AM slot now REAL (Dominique Hutchinson / Matt Poling) from nashvillemusiccalendar.com. Source still lists only through ~2 PM; evening slots for most bars remain placeholders. Backup: data/app.db.bak-1016am.
- 2026-10-16 13:20 UTC: REAL afternoon/evening/late slots (1-3) for legends, bootbarn (The Stage), aldeans, luke32 from nashvillemusiccalendar.com venue pages (JSON-LD). Replaced 10/15 bands that had been carried into the 10/16 slot2. Backup: data/app.db.bak-1016pm.
- Still not real for 10/16: roberts slots 1-3 (source lists only 10 AM; slot2 still shows 10/15's Kelley's Heroes), and all slots for tootsies, layla, acme, wildhorse, honkytonkcentral (no listings on source).
