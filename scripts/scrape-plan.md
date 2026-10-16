# Lineup ingest plan (future)
**Target rows:** `bands(id,name)` upsert by slugified name; `sets(id='{date}-{bar}-{slot}', bar_id, band_id, date, set_start, set_end, set_window_id='{date}-slot{n}')`. Map event start time to nearest 4h slot (10/14/18/22 CT); keep the actual start in `set_start`. Update `band_id` in place (never delete sets that have ratings); retag `ratings.band_id` for that set_id. Unknown slots stay as "Live music (TBA)".
**Schedule:** daily 9 AM CT + refresh 5 PM CT; diff and log changes.
**Sources, in order of preference:**
1. Official feeds/permission: ask each venue (or Nashville Music Calendar) for an ICS/JSON feed or API key — see docs/outreach-bars.md template 3.
2. Venue-published public calendars (ICS, Google Calendar, Eventbrite/Bandsintown APIs under their terms).
3. HTML parsing only where the site's ToS and robots.txt allow it, at low rate (≤1 req/min/site, identified User-Agent), with attribution and a link back.
**Compliance:** check ToS/robots.txt per source; stop on request; no bypassing logins/paywalls/rate limits; credit the venue/source on lineup pages; no logos or "official partner" claims without written approval. Not legal advice.
