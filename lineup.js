// Daily set grid + real-listing ingest from Nashville Music Calendar venue pages (schema.org JSON-LD).
// Low rate (one request every 3s, identified User-Agent), venue pages only (allowed by robots.txt), credited as source.
const db=require('./db'),S=require('./scoring');
const SLOTS=[["10:00","14:00"],["14:00","18:00"],["18:00","22:00"],["22:00","02:00"]];
const TBA_ID='tba',TBA_NAME='Live music (TBA)';
const SOURCE_NAME='Nashville Music Calendar';
// bar id -> nashvillemusiccalendar.com venue slug (null = no venue page on the source)
const VENUES={tootsies:'tootsies-orchid-lounge',roberts:'roberts-western-world',legends:'legends-corner',layla:null,
 acme:'acme-feed-seed',wildhorse:null,bootbarn:'the-stage-on-broadway',honkytonkcentral:'honky-tonk-central',
 luke32:'lukes-32-bridge-food-drink',aldeans:'jason-aldeans-kitchen-rooftop-bar'};
const UA='BroadwayTonight/0.2 (+https://broadway-tonight.onrender.com; lineup listings, low rate)';
try{db.exec('ALTER TABLE sets ADD COLUMN source TEXT')}catch(e){}
try{db.exec('ALTER TABLE sets ADD COLUMN source_url TEXT')}catch(e){}
db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run(TBA_ID,TBA_NAME);
const H=3600e3;
function nextNight(d){const t=Date.parse(d+'T12:00:00Z')+24*H;return new Date(t).toISOString().slice(0,10);}
// Create the 4-slot grid for every bar on a night (idempotent).
function ensureDay(date){db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run(TBA_ID,TBA_NAME);const bars=db.prepare('SELECT id FROM bars').all();
 const ins=db.prepare('INSERT OR IGNORE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source) VALUES(?,?,?,?,?,?,?,?)');let n=0;
 db.transaction(()=>{for(const b of bars)SLOTS.forEach((s,i)=>{n+=ins.run(`${date}-${b.id}-${i}`,b.id,TBA_ID,date,s[0],s[1],`${date}-slot${i}`,'grid').changes;});})();return n;}
// Replace seed sample band names (band0..band19) on today/future nights with TBA.
function clearSampleBands(fromDate){return db.prepare("UPDATE sets SET band_id=?,source='grid' WHERE date>=? AND band_id GLOB 'band[0-9]*' AND COALESCE(source,'') NOT IN ('owner')").run(TBA_ID,fromDate).changes;}
const slotFor=h=>h<3?3:h<14?0:h<18?1:h<22?2:3;
function walk(x,out){if(Array.isArray(x))x.forEach(v=>walk(v,out));else if(x&&typeof x==='object'){if(/Event/.test(String(x['@type']))&&x.startDate)out.push(x);Object.values(x).forEach(v=>walk(v,out));}}
const dec=s=>String(s||'').replace(/&#8217;|&rsquo;/g,'\u2019').replace(/&amp;/g,'&').replace(/&#0?39;/g,"'").replace(/&quot;/g,'"').trim();
async function fetchVenue(slug){const url=`https://nashvillemusiccalendar.com/venue/${slug}/`;
 const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html'}});if(!r.ok)throw new Error(slug+' HTTP '+r.status);
 const h=await r.text();const out=[];for(const m of h.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)){try{walk(JSON.parse(m[1]),out)}catch(e){}}
 const seen=new Set();return {url,bytes:h.length,challenge:/One moment, please/.test(h),events:out.filter(e=>{const k=e.url||e.name+e.startDate;if(seen.has(k))return false;seen.add(k);return true;})};}
function bandIdFor(name){const ex=db.prepare('SELECT id FROM bands WHERE lower(name)=lower(?)').get(name);if(ex)return ex.id;
 const id='nmc_'+(name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'band');db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run(id,name);return id;}
const hhmm=iso=>String(iso).slice(11,16);
const nightOf=iso=>S.ctNight(Date.parse(iso));
// Pull listings for one or more nights; owner-edited sets are never overwritten.
let running=null,last=null;
async function refresh(dates){if(running)return running;running=(async()=>{const res={at:new Date().toISOString(),dates,bars:{},errors:[]};
 for(const d of dates){ensureDay(d);clearSampleBands(d);}
 const bars=db.prepare('SELECT id,name FROM bars').all();let first=true;
 for(const b of bars){const slug=VENUES[b.id];if(!slug){res.bars[b.id]={listed:0,note:'no venue page on source'};continue;}
  if(!first)await new Promise(r=>setTimeout(r,3000));first=false;
  let v;try{v=await fetchVenue(slug)}catch(e){res.errors.push(e.message);res.bars[b.id]={listed:0,note:'fetch failed'};continue;}
  const per={};
  for(const d of dates){const evs=v.events.filter(e=>nightOf(e.startDate)===d).sort((a,b)=>Date.parse(a.startDate)-Date.parse(b.startDate));
   db.transaction(()=>{
    // drop previous extra (non-grid) source sets without ratings; grid sets are reset to TBA if not owner-edited
    db.prepare("DELETE FROM sets WHERE bar_id=? AND date=? AND source='nmc' AND id GLOB '*-x*' AND id NOT IN (SELECT DISTINCT set_id FROM ratings WHERE set_id IS NOT NULL)").run(b.id,d);
    const used={};let n=0;
    for(const e of evs){const name=dec((e.performer&&(e.performer.name||(Array.isArray(e.performer)&&e.performer[0]&&e.performer[0].name)))||String(e.name).replace(/\s+at\s+.*$/,''));if(!name)continue;
     const st=hhmm(e.startDate),en=e.endDate?hhmm(e.endDate):null,si=slotFor(+st.slice(0,2));const k=used[si]=(used[si]||0)+1;
     const gid=`${d}-${b.id}-${si}`,g=db.prepare('SELECT * FROM sets WHERE id=?').get(gid);
     if(k===1&&g&&g.source!=='owner'){db.prepare("UPDATE sets SET band_id=?,set_start=?,set_end=COALESCE(?,set_end),source='nmc',source_url=? WHERE id=?").run(bandIdFor(name),st,en,e.url||v.url,gid);n++;}
     else if(k>1&&g&&g.source!=='owner'){db.prepare("INSERT OR REPLACE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,source_url) VALUES(?,?,?,?,?,?,?,?,?)").run(`${gid}-x${k}`,b.id,bandIdFor(name),d,st,en||st,`${d}-slot${si}`,'nmc',e.url||v.url);n++;}}
    // grid slots previously filled from the source but no longer listed go back to TBA
    for(let si=0;si<4;si++)if(!used[si])db.prepare("UPDATE sets SET band_id=?,set_start=?,set_end=?,source='grid',source_url=NULL WHERE id=? AND source='nmc'").run(TBA_ID,SLOTS[si][0],SLOTS[si][1],`${d}-${b.id}-${si}`);
    per[d]=n;})();}
  res.bars[b.id]={listed:per,source:v.url,pageBytes:v.bytes,challenge:v.challenge,eventsOnPage:v.events.length};}
 last=res;console.log('[lineup] refresh',JSON.stringify({dates,errors:res.errors}));return res;})();
 try{return await running}finally{running=null}}
function start(){const tick=()=>{try{const n=S.ctNight();ensureDay(n);ensureDay(nextNight(n));clearSampleBands(n);}catch(e){console.error('[lineup] grid',e)}};
 tick();setInterval(tick,5*60e3); // night flip at 3 AM CT: grid for the new night appears within 5 min (and a day ahead)
 const run=()=>{const n=S.ctNight();refresh([n,nextNight(n)]).catch(e=>console.error('[lineup] refresh',e));};
 setTimeout(run,15e3);setInterval(run,3*H);}
module.exports={ensureDay,refresh,start,clearSampleBands,nextNight,status:()=>last,VENUES,SOURCE_NAME};
