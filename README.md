# Broadway Tonight — MVP
Lower Broadway lineup + one-tap set ratings + Hot Right Now leaderboards. Scoring per `/workspace/broadway-hotscore-mvp-spec.md` (see `scoring.js`).
## Run
    npm install
    npm run seed     # resets data/app.db with sample lineup for tonight (CT) + fake ratings
    npm start        # http://127.0.0.1:3847/  (bound to localhost only)
## Picks
`data/featured.json` drives two home-page promos. Leave `barId` blank, and `hotRightNow.band` blank, and that block stays hidden. `image` is an https URL or a path on this site. `handle` is an Instagram name, with or without @. `weekOf` is `YYYY-MM-DD`.

Set them in the file, or with the admin key:

    curl -X POST -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
      -d '{"barOfTheWeek":{"barId":"whiskeybent","blurb":"...","handle":"whiskeybent","weekOf":"2026-11-02"},"hotRightNow":{"barId":"whiskeybent","band":"House band","line":"..."}}' \
      http://127.0.0.1:3847/api/admin/featured

<!-- sample, not live. Copy into data/featured.json when you want it on the site.
{
  "barOfTheWeek": {
    "barId": "whiskeybent",
    "blurb": "Classic Lower Broadway room at 306 Broadway. Live bands and a full bar.",
    "image": "",
    "handle": "whiskeybent",
    "weekOf": "2026-11-02"
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
