# Bar outreach templates (drafts — not sent)
## 1. Cold intro
**Subject:** {{BAR_NAME}} on Broadway Tonight
Hi {{CONTACT_NAME}}, I'm building **Broadway Tonight**, a phone-first guide to who's playing on Lower Broadway right now. Guests leave **one-tap ratings** (plus a vibe tag like "packed" or "chill") and the best rooms climb our **Hot Right Now** board. {{BAR_NAME}} is already listed with tonight's lineup — happy to show you the page and make sure the details are right. 10 minutes this week? Or tap this private link anytime: {{OWNER_LINK}} — no login, just edit tonight's bands and save. — {{YOUR_NAME}}, {{PHONE}}
## 2. Sponsored slot
**Subject:** Top-of-page spot for {{BAR_NAME}} on Broadway Tonight
Hi {{CONTACT_NAME}}, Broadway Tonight has a gold **Sponsored** card at the top of the app, above **Hot Right Now**. It's clearly labeled Sponsored and never changes ratings — it just puts {{BAR_NAME}} and tonight's band in front of people choosing where to go next. Founding rate for {{DATES}}: {{PRICE}}. Want a preview? — {{YOUR_NAME}}
## 3. Lineup feed partnership
**Subject:** Keeping {{BAR_NAME}}'s lineup accurate on Broadway Tonight
Hi {{CONTACT_NAME}}, we show every set on Broadway Tonight so guests can rate the night with **one tap**. We'd rather get lineups from you than guess: could you share a calendar feed (Google/ICS/spreadsheet) or give us permission to pull from your website? We credit {{BAR_NAME}} on every lineup and won't use your logo without OK. Bands get exposure on **Hot Right Now** too. Or tap this private link anytime: {{OWNER_LINK}} — no login, just edit tonight's bands and save. — {{YOUR_NAME}}

## Notes (updated 2026-10-17)
- **Live site:** https://broadwaytonightnash.com (Render Starter + 1 GB disk; data persists across restarts/redeploys).
- **Owner magic links:** one private link per bar, form `https://broadwaytonightnash.com/owner/{{TOKEN}}`. Current links are in `data/owner-links-public.txt` (git-ignored; never commit or post publicly). Regenerate any time with `GET /api/admin/owner-links` using the `x-admin-key` header (key in `/workspace/.admin_key`). The old `127.0.0.1:3847` links in `data/owner-links.txt` are local-only and don't work for bars.
- In each invite, replace a "reply with your lineup" ask with: "Tap your private link to update tonight's bands: {{OWNER_LINK}}. No login. Bookmark it; the same link works every day."
- Every bar gets 4 time slots per night automatically (10a, 2p, 6p, 10p CT), so the link always has today's sets to edit. Owner edits are never overwritten by automatic listings.
- **Bars to prioritize for owner links** (no public advance lineup we can use): Tootsie's, Honky Tonk Central, Acme Feed & Seed, Layla's, Wildhorse Saloon.
- Site now lists 33 bars (2026-10-17). Automatic listings that work from our host: Acme, Ole Red, Redneck Riviera, Margaritaville (their own sites). Blocked from our host by bot checks: Nashville Music Calendar, Luke's 32 Bridge, Casa Rosa, Bell Bottoms Up. Everyone else depends on owner links.
- Automatic listings from Nashville Music Calendar are currently blocked from our host (bot check). Template 3 (lineup feed partnership) also applies to Nashville Music Calendar: ask them for a feed or permission.
