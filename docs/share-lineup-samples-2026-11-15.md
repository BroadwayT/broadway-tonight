# Share lineup samples (Nov 15, 2026)

Samples only. Nothing is live until Jules says yes. Branch: `improve-share-lineup`.

Times below are Central Time (America/Chicago). The live lineup was pulled from https://broadwaytonightnash.com/api/lineup?date=2026-11-15 (201 sets, 32 bars). Featured cards came from `/api/picks` the same day: Bar of the Week is Posty's, Band of the Week is Joe Barron, Hot Right Now is Conner Sweet Band at The Stage.

## How the old button chose rows

`shareLineup()` in `public/index.html` fetched `/api/lineup?date=today` and took the first 8 rows as returned, with no filter and no sense of time:

```js
const lines=(d.sets||[]).slice(0,8).map(s=>`${showRange(s.set_start,s.set_end)} ${s.band}${s.stage?` (${s.stage})`:''} at ${s.bar}`);
```

The lineup API sorts with `ORDER BY b.name, s.set_start`, so the list always starts at AJ's Good Time Bar, then Acme Feed & Seed, then Ole Red, and so on. That is why the share sheet was almost all AJ's and Acme, including `Live music (TBA)` rows and late-night sets that were not on yet. The same 8 lines came up no matter when you tapped Share lineup.

This is what the current live button produces for Nov 15 (em dashes are from the old time-range formatter):

```
Tonight on Lower Broadway
11 AM–2 PM Russell Brown at AJ's Good Time Bar
2–6 PM The Bruisers at AJ's Good Time Bar
6–10 PM Addison Simmons at AJ's Good Time Bar
10 PM–1 AM 90's Proof at AJ's Good Time Bar
10:30 AM–1:30 PM Amanda Accardi at Acme Feed & Seed
2–6 PM Live music (TBA) at Acme Feed & Seed
6–9 PM Timbo at Acme Feed & Seed
10 PM–2 AM Live music (TBA) at Acme Feed & Seed
https://broadwaytonightnash.com/#lineup
```

## How the new button chooses rows

- Drops TBA / "Live music" rows.
- Keeps one set per bar, so the list spreads down the street.
- Uses Central time at the moment you tap: sets that already ended are out; sets on now or up next are in.
- Always tries to include Band of the Week (Joe Barron), Hot Right Now, engaged bands, and Bar of the Week (Posty's) when they still have a now or later set.
- Lists up to 10 lines as `Band, Short bar name, 12-hour start time`.
- Ends with a count of the other named bands tonight, then `Full lineup: broadwaytonightnash.com`.

The text is about 420-440 characters, short enough to paste into a text message.

## Sample: 2 PM CT

Joe Barron is listed first even though he does not start until 4 PM, because he is Band of the Week. Conner Sweet is next (Hot Right Now, starts at 2:45). Posty's is included as Bar of the Week. The rest are bands that go on at 2 PM at other bars.

```
Tonight on Lower Broadway
Joe Barron, This Bar, 4 PM
Conner Sweet Band, The Stage, 2:45 PM
Phillips Family Electric, Posty's, 2 PM
4 Dudes 1 Fiddle, Boogie Bar, 2 PM
Andrew Mack, Redneck Riviera, 2 PM
Ashton Smith, JBJ's, 2 PM
Betty Rose, Layla's, 2 PM
Cash Crawford, Friends in Low Places, 2 PM
Jackson Capps, Kid Rock's, 2 PM
Jake Holder and The Misfits, Kane Brown's, 2 PM
+ 171 more bands tonight
Full lineup: broadwaytonightnash.com
```

## Sample: 7 PM CT

Joe is still on (rooftop set that started at 6 PM). Conner Sweet has finished, so he drops off. Posty's current band is in. The rest are bands that started around 6:30-7 PM at other bars.

```
Tonight on Lower Broadway
Joe Barron, This Bar, 6 PM
Brian Thomas, Posty's, 6 PM
Renata The Band, Ole Red, 7 PM
Christian Stolz, Whiskey Row, 7 PM
Shannon Willis, Redneck Riviera, 7 PM
Jered Ames, Legends Corner, 6:45 PM
Robert Abernathy, The Stage, 6:45 PM
Jake Holder, Category 10, 6:45 PM
Chris Casello Trio, Robert's, 6:30 PM
Troy Woods, Nudie's, 6:30 PM
+ 171 more bands tonight
Full lineup: broadwaytonightnash.com
```

## Sample: 10:30 PM CT

Joe's last set ended at 10 PM, so he is no longer listed. Posty's late set is still included. The rest are bands on now at other bars, including ones that play past midnight.

```
Tonight on Lower Broadway
No Good Deed Band, Posty's, 10 PM
RATILLA, Goodnight Nashville, 10:30 PM
Cole Tomlinson Band, Whiskey Row, 10:30 PM
Trey Lewis, Tin Roof, 10:30 PM
Stoney T, Nudie's, 10:30 PM
Sweet Megg, Robert's, 10:30 PM
Andrew Vendelis, Kane Brown's, 10 PM
Hand Over Face, JBJ's, 10 PM
Millie, Boogie Bar, 10 PM
ChiliDawg & the Pound, Bootleggers, 10 PM
+ 171 more bands tonight
Full lineup: broadwaytonightnash.com
```
