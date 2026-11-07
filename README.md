# Broadway Tonight — MVP
Lower Broadway lineup + one-tap set ratings + Hot Right Now leaderboards. Scoring per `/workspace/broadway-hotscore-mvp-spec.md` (see `scoring.js`).
## Run
    npm install
    npm run seed     # resets data/app.db with sample lineup for tonight (CT) + fake ratings
    npm start        # http://127.0.0.1:3847/  (bound to localhost only)
## Picks
`data/featured.json` drives Bar of the Week, Band Spotlight, and Hot Right Now. Leave `barOfTheWeek.barId` blank, `bandSpotlight.name` blank, and `hotRightNow` without a bar or band, and that block stays hidden. `image` and `photo` are https URLs or paths on this site. `handle`, `instagram`, and `tiktok` are names, with or without @. `weekOf` is `YYYY-MM-DD`. `offers` is a list of `{title, detail}` taken from the bar's own site. `video` is optional `{src, poster, sourceUrl}` and only for a clip the band posted of themselves performing. Next Broadway times are filled from the lineup when the spotlight name matches.

Set them in the file, or with the admin key:

    curl -X POST -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
      -d '{"barOfTheWeek":{"barId":"whiskeybent","blurb":"...","handle":"whiskeybent","weekOf":"2026-11-02"},"hotRightNow":{"barId":"whiskeybent","band":"House band","line":"..."}}' \
      http://127.0.0.1:3847/api/admin/featured

<!-- sample, not live. Copy into data/featured.json when you want it on the site.
{
  "barOfTheWeek": {
    "barId": "whiskeybent",
    "blurb": "Family-owned honky-tonk at 306 Broadway.",
    "history": "Two or three plain sentences from the bar's own site.",
    "offers": [{"title": "Live music", "detail": "What their site lists for tonight."}],
    "website": "https://whiskeybentnash.com/",
    "sourceUrl": "https://whiskeybentnash.com/about",
    "image": "",
    "handle": "whiskeybentsaloon",
    "weekOf": "2026-11-02"
  },
  "bandSpotlight": {
    "name": "Sarah Gayle Meech",
    "photo": "",
    "photoCredit": "Photo from the artist's own site",
    "story": "Two or three sentences from public bios.",
    "nextBroadwaySets": [],
    "instagram": "sarahgaylemeech",
    "tiktok": "",
    "website": "https://www.sarahgaylemeech.com/",
    "video": null
  },
  "hotRightNow": {
    "barId": "whiskeybent",
    "band": "House band",
    "line": "On stage at Whiskey Bent tonight."
  }
}
-->

## API
- `GET /api/lineup?date=today` · `POST /api/ratings {barId,bandId,setId,rating,checkIn}`
- `GET /api/picks` · `GET|POST /api/admin/featured` (admin key)
- `GET /api/leaderboards/tonight|week|streak` · `GET /api/bars/:id/score` · `GET /api/featured` · `GET /api/admin/review` (spike queue)
## Files
`server.js` API + anti-gaming · `scoring.js` formulas · `db.js` schema · `scripts/seed.js` sample data (real scraper plugs in here later) · `public/index.html` mobile UI.
