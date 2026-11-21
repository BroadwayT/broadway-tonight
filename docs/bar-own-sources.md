## Morning lineup check, Friday November 20, 2026 (added pages)

- Ole Red Nashville, per-day lineup for any date: the site's own calendar widget posts `action=olered_get_calendar` with `args[date]=MM/DD/YYYY` to `https://olered.com/nashville/wp-admin/admin-ajax.php` (the same call the "View Next Day" button makes). The response mixes all Ole Red locations; Nashville rows are the ones with no location label. Special closures are on `https://olered.com/nashville/wp-json/tribe/events/v1/events`. A Nov 26 listing there reads CLOSED while the calendar widget shows a THANKSGIVING 11:00 AM-10:00 PM listing, so Nov 26 was not changed.
- Category 10 Nashville, per-day lineup for any date: `action=cat_10_get_calendar` with `args[date]=MM/DD/YYYY` to `https://www.category10.com/nashville/wp-admin/admin-ajax.php` (the same call the calendar's Previous/Next buttons make). Nov 26 reads "Closed for Thanksgiving 11:00 AM - 12:00 AM".
- Bootleggers Inn: https://www.bootleggersnashville.com/event-list lists named sets per day (Rocky Bottom and Cullen Greer Nov 20, Zach Neal Nov 22 were missing from the site before this check).
- Layla's Honky Tonk: https://www.laylasnashville.com/livemusic says "see our LIVE MUSIC SCHEDULE below" but the schedule widget is empty without JavaScript. Nothing readable there for Nov 20-26.
- Margaritaville Nashville: https://www.margaritavillenashville.com/calendar still says "Check back soon! There are no events at this time." (Nov 20).
- Lucky Bastard Saloon: https://luckybastardsaloon.com/ returns a Cloudflare challenge (403) to non-browser fetches.

## Morning lineup check, Saturday November 21, 2026 (added pages)

- The Stage on Broadway: https://thestageonbroadway.com/calendar embeds a BeatGig (dusk.fm) calendar. Its public venue page https://dusk.fm/venues/thestageonbroadway carries the full list as JSON-LD (`bookingsJsonLdString` in `__NEXT_DATA__`): named sets with start and end for all three floors, with no floor label, and the "Z" times are really Central. Instagram: @stageonbroadway (rooftop schedule slide, undated, posted the morning of Nov 21).
- Friends in Low Places: @friendsbarnash story slides "TODAY AT FLIP" (main stage) and "ON THE ROOFTOP" (Oasis) list that day's sets. Oasis DJs (BMAC, DJ Tanner, Rod Youree) are not listed on the site.
- Ole Red: @olered (no schedule in stories Nov 21). Per-day Nashville rows via the olered_get_calendar call (rows labeled "Ole Red Nashville" only).
- Category 10: @officialcategory10 (no Nashville schedule in stories Nov 21). Per-day rows via cat_10_get_calendar.
- Bootleggers Inn: @bootleggersinn (holiday party promo only). The event-list page lists named sets for Nov 21-23.
- Kane Brown's On Broadway: @kanebrownsonbroadway. Tootsie's: @tootsiesvip. Neither posted sets in stories Nov 21.
- Acme: https://www.acmefeedandseed.com/calendar?format=json returns the full event list (Squarespace). Its Nov 21 8 PM slot, previously Wild Bill & The Bruisers, now reads TBA.
- Luke's 32 Bridge: https://lukes32bridge.com/live-music/ returned a bot-check page to the box on Nov 21.
