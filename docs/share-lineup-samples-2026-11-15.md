# Share lineup samples for Nov 15, 2026

The Share lineup button lists 5 named bands, one per bar, that are on now or up next. Band of the Week and Hot Right Now go first, then Bar of the Week, then other bands. TBA and "live band" rows are left out.

The "+ N more bands tonight" line is the count of distinct named, non-TBA bands on tonight's lineup, minus the bands already listed. Names are deduplicated, so a band with two sets counts once.

On Nov 15 that is 181 distinct named bands (185 named sets at 30 bars, plus 16 TBA slots, 201 sets in total). Listing 5 leaves **+ 176 more bands tonight**. The earlier 10-band sample said + 171, which was 181 minus 10, not a counting bug. The full-day Broadway grid is larger than an evening-only list of about 70 sets.

Generated from the live `/api/lineup?date=today` and `/api/picks` data on Nov 15.

## Sample: 2 PM CT

Joe Barron is listed first even though he does not start until 4 PM, because he is Band of the Week. Conner Sweet is next (Hot Right Now, starts at 2:45). Posty's is included as Bar of the Week. The rest are bands that go on at 2 PM at other bars.

```
Tonight on Lower Broadway
Joe Barron, This Bar, 4 PM
Conner Sweet Band, The Stage, 2:45 PM
Phillips Family Electric, Posty's, 2 PM
4 Dudes 1 Fiddle, Boogie Bar, 2 PM
Andrew Mack, Redneck Riviera, 2 PM
+ 176 more bands tonight
Full lineup: broadwaytonightnash.com
```

## Sample: 7 PM CT

Joe is still on (rooftop set that started at 6 PM). Conner Sweet has finished, so he drops off. Posty's current band is in. The rest are bands that start around 7 PM at other bars.

```
Tonight on Lower Broadway
Joe Barron, This Bar, 6 PM
Brian Thomas, Posty's, 6 PM
Renata The Band, Ole Red, 7 PM
Christian Stolz, Whiskey Row, 7 PM
Shannon Willis, Redneck Riviera, 7 PM
+ 176 more bands tonight
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
+ 176 more bands tonight
Full lineup: broadwaytonightnash.com
```
