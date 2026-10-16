# Broadway Tonight — MVP
Lower Broadway lineup + one-tap set ratings + Hot Right Now leaderboards. Scoring per `/workspace/broadway-hotscore-mvp-spec.md` (see `scoring.js`).
## Run
    npm install
    npm run seed     # resets data/app.db with sample lineup for tonight (CT) + fake ratings
    npm start        # http://127.0.0.1:3847/  (bound to localhost only)
## API
- `GET /api/lineup?date=today` · `POST /api/ratings {barId,bandId,setId,rating,checkIn}`
- `GET /api/leaderboards/tonight|week|streak` · `GET /api/bars/:id/score` · `GET /api/featured` · `GET /api/admin/review` (spike queue)
## Files
`server.js` API + anti-gaming · `scoring.js` formulas · `db.js` schema · `scripts/seed.js` sample data (real scraper plugs in here later) · `public/index.html` mobile UI.
