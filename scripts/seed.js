// Seeds sample Lower Broadway lineup + fake ratings. Scraping is OUT OF SCOPE:
// a scraper (e.g. scripts/scrape.js) plugs in later by writing the same bars/bands/sets rows.
const db=require('../db'),S=require('../scoring'),H=S.H,now=Date.now();
db.exec('DELETE FROM ratings;DELETE FROM sets;DELETE FROM bands;DELETE FROM bars;DELETE FROM daily_top5;DELETE FROM sponsors;DELETE FROM review_queue;');
const bars=[["tootsies","Tootsie's Orchid Lounge","422 Broadway"],["roberts","Robert's Western World","416 Broadway"],["legends","Legends Corner","428 Broadway"],["layla","Layla's Honky Tonk","418 Broadway"],["acme","Acme Feed & Seed","101 Broadway"],["wildhorse","Wildhorse Saloon","120 2nd Ave N"],["bootbarn","The Stage on Broadway","412 Broadway"],["honkytonkcentral","Honky Tonk Central","329 Broadway"],["luke32","Luke's 32 Bridge","301 Broadway"],["aldeans","Jason Aldean's Kitchen + Rooftop","307 Broadway"]];
const bands=["Whiskey Hollow","The Cumberland Strays","Rachel Lynn & Copper Creek","Hank Rider Band","Delta Dawn Revival","Mason Tate","Bluebird Outlaws","The Steel Pedal Kings","Jenna Rae","Broadway Bound","Rusty Spur Trio","Lainey Cole","Tennessee Two-Step","Gravel Road Choir","Sadie Mae & the Tumbleweeds","Cody Ray Wells","The Lost Highway Boys","Kristen Hale","Riverbend","Neon Saints"];
const ib=db.prepare('INSERT INTO bars VALUES(?,?,?)');bars.forEach(b=>ib.run(...b));
const ibd=db.prepare('INSERT INTO bands VALUES(?,?)');bands.forEach((b,i)=>ibd.run('band'+i,b));
const night=S.ctNight(now);const is=db.prepare('INSERT INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id) VALUES(?,?,?,?,?,?,?)');
// 4-hour set slots (honky-tonk shifts): 10a-2p,2p-6p,6p-10p,10p-2a CT. Window id = set slot.
const slots=[["10:00","14:00"],["14:00","18:00"],["18:00","22:00"],["22:00","02:00"]];
const sets=[];bars.forEach((b,bi)=>slots.forEach((s,si)=>{const id=`${night}-${b[0]}-${si}`,band='band'+((bi*2+si)%bands.length);is.run(id,b[0],band,night,s[0],s[1],`${night}-slot${si}`);sets.push({id,bar:b[0],band,win:`${night}-slot${si}`});}));
const ir=db.prepare('INSERT OR IGNORE INTO ratings(bar_id,band_id,set_id,set_window_id,rating,device_id,ip_hash,check_in,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
let dev=0;const add=(bar,ratings,minH,maxH,ci=0.5,tag='t')=>{const ss=sets.filter(s=>s.bar===bar);ratings.forEach((r,i)=>{const s=ss[i%ss.length];dev++;ir.run(bar,s.band,s.id,s.win+tag+i,r,'seed-dev-'+dev,'seed-ip-'+dev,Math.random()<ci?1:0,now-(minH+Math.random()*(maxH-minH))*H);});};
const rep=(v,n)=>Array(n).fill(v);
// Tonight (last 6h). Acceptance demo: legends 3x5 vs roberts 40x4.
add('roberts',rep(4,40),0.1,5.5);add('tootsies',[...rep(5,14),...rep(4,8),3,3],0.1,5);add('acme',[5,4,4,3,4,5,4],0.2,4);add('legends',rep(5,3),0.1,1);add('layla',[4,4,5,3,4,4],0.5,5);add('honkytonkcentral',[3,4,3,3,2,4],0.5,5);
// Week history (1-6 days ago)
for(const b of bars)add(b[0],Array.from({length:10+Math.floor(Math.random()*20)},()=>3+Math.floor(Math.random()*3)),24,160,0.4,'w');
// Streak history: past nights' top-5 snapshots
const hist={roberts:6,tootsies:4,layla:2,acme:1,honkytonkcentral:3,luke32:1};
const it=db.prepare('INSERT OR IGNORE INTO daily_top5 VALUES(?,?)');
for(const [b,n] of Object.entries(hist))for(let d=1;d<=n;d++)it.run(S.ctNight(now-d*24*H),b);
it.run(S.ctNight(now-3*24*H),'wildhorse'); // older entry; broken streak (miss on day 1-2) => streak 0
// Demo sponsor (hardcoded, 1 slot). Tier would come from last week's Tonight rank.
db.prepare('INSERT INTO sponsors VALUES(?,?,?)').run('wildhorse',night,'entry (non-ranked)');
console.log('Seeded',bars.length,'bars,',sets.length,'sets, night',night);
