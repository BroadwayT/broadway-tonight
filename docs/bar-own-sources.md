## Morning lineup check, Friday November 20, 2026 (added pages)

- Ole Red Nashville, per-day lineup for any date: the site's own calendar widget posts `action=olered_get_calendar` with `args[date]=MM/DD/YYYY` to `https://olered.com/nashville/wp-admin/admin-ajax.php` (the same call the "View Next Day" button makes). The response mixes all Ole Red locations; Nashville rows are the ones with no location label. Special closures are on `https://olered.com/nashville/wp-json/tribe/events/v1/events`. A Nov 26 listing there reads CLOSED while the calendar widget shows a THANKSGIVING 11:00 AM-10:00 PM listing, so Nov 26 was not changed.
- Category 10 Nashville, per-day lineup for any date: `action=cat_10_get_calendar` with `args[date]=MM/DD/YYYY` to `https://www.category10.com/nashville/wp-admin/admin-ajax.php` (the same call the calendar's Previous/Next buttons make). Nov 26 reads "Closed for Thanksgiving 11:00 AM - 12:00 AM".
- Bootleggers Inn: https://www.bootleggersnashville.com/event-list lists named sets per day (Rocky Bottom and Cullen Greer Nov 20, Zach Neal Nov 22 were missing from the site before this check).
- Layla's Honky Tonk: https://www.laylasnashville.com/livemusic says "see our LIVE MUSIC SCHEDULE below" but the schedule widget is empty without JavaScript. Nothing readable there for Nov 20-26.
- Margaritaville Nashville: https://www.margaritavillenashville.com/calendar still says "Check back soon! There are no events at this time." (Nov 20).
- Lucky Bastard Saloon: https://luckybastardsaloon.com/ returns a Cloudflare challenge (403) to non-browser fetches.
