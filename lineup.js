// Daily set grid plus listings from each bar's own site. Low rate, identified User-Agent, robots.txt checked.
const db=require('./db'),S=require('./scoring'),SRC=require('./sources');
const SLOTS=[["10:00","14:00"],["14:00","18:00"],["18:00","22:00"],["22:00","02:00"]];
const TBA_ID='tba',TBA_NAME='Live bands all day';
const BAR_SOURCE='bar';
try{db.exec('ALTER TABLE sets ADD COLUMN source TEXT')}catch(e){}
try{db.exec('ALTER TABLE sets ADD COLUMN source_url TEXT')}catch(e){}
try{db.exec('ALTER TABLE sets ADD COLUMN note TEXT')}catch(e){}
db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run(TBA_ID,TBA_NAME);
db.prepare('UPDATE bands SET name=? WHERE id=? AND name<>?').run(TBA_NAME,TBA_ID,TBA_NAME);
const H=3600e3;
function nextNight(d){const t=Date.parse(d+'T12:00:00Z')+24*H;return new Date(t).toISOString().slice(0,10);}
// Closures (manual-sets.json "closures": [{bar,date,closed_from,closed_to}], or a sets entry with closed_from/closed_to): no empty TBA slot rows in that range.
// Times are night-relative 24h CT (before 6 AM = after midnight, so 22:00-03:00 works); a slot is closed if its start is in [closed_from, closed_to).
let CLOSED=[];try{const J=require('./manual-sets.json');CLOSED=[...(J.closures||[]),...(J.sets||[])].filter(c=>c&&c.bar&&/^\d{4}-\d{2}-\d{2}$/.test(c.date)&&/^\d\d:\d\d$/.test(c.closed_from)&&/^\d\d:\d\d$/.test(c.closed_to));}catch(e){console.error('[lineup] closures',e.message)}
const nRel=t=>{const [h,m]=String(t).split(':').map(Number);return (h<6?h+24:h)*60+(m||0);};
function isClosed(bar,date,start){const x=nRel(start);return CLOSED.some(c=>c.bar===bar&&c.date===date&&x>=nRel(c.closed_from)&&x<nRel(c.closed_to));}
// Remove empty TBA grid rows inside a closure (never owner-edited or rated rows). Idempotent.
function applyClosures(fromDate){let n=0;for(const c of CLOSED){if(c.date<fromDate)continue;
 for(const r of db.prepare("SELECT id,set_start FROM sets WHERE bar_id=? AND date=? AND band_id=? AND COALESCE(source,'grid')='grid' AND id NOT IN (SELECT DISTINCT set_id FROM ratings WHERE set_id IS NOT NULL)").all(c.bar,c.date,TBA_ID))
  if(isClosed(c.bar,c.date,r.set_start))n+=db.prepare('DELETE FROM sets WHERE id=?').run(r.id).changes;}return n;}
// Create the 4-slot grid for every bar on a night (idempotent).
function ensureDay(date){db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run(TBA_ID,TBA_NAME);
db.prepare('UPDATE bands SET name=? WHERE id=? AND name<>?').run(TBA_NAME,TBA_ID,TBA_NAME);const bars=db.prepare('SELECT id FROM bars').all();
 const ins=db.prepare('INSERT OR IGNORE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source) VALUES(?,?,?,?,?,?,?,?)');let n=0;
 db.transaction(()=>{for(const b of bars)SLOTS.forEach((s,i)=>{if(isClosed(b.id,date,s[0])||slotTaken(b.id,date,i))return;n+=ins.run(`${date}-${b.id}-${i}`,b.id,TBA_ID,date,s[0],s[1],`${date}-slot${i}`,'grid').changes;});})();return n;}
// Replace seed sample band names (band0..band19) on today/future nights with TBA.
function clearSampleBands(fromDate){return db.prepare("UPDATE sets SET band_id=?,source='grid' WHERE date>=? AND band_id GLOB 'band[0-9]*' AND COALESCE(source,'') NOT IN ('owner')").run(TBA_ID,fromDate).changes;}
const slotFor=h=>h<3?3:h<14?0:h<18?1:h<22?2:3;
// Named main-floor set (blank stage) whose start falls in this grid slot already occupies it.
function slotTaken(bar,date,si,exceptId){return db.prepare("SELECT set_start FROM sets WHERE bar_id=? AND date=? AND band_id<>? AND COALESCE(stage,'')='' AND id<>?").all(bar,date,TBA_ID,exceptId||'').some(r=>slotFor(+String(r.set_start).slice(0,2))===si);}
function bandIdFor(name){const ex=db.prepare('SELECT id FROM bands WHERE lower(name)=lower(?)').get(name);if(ex)return ex.id;
 const id='act_'+(name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'band');db.prepare('INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)').run(id,name);return id;}
// Manual sets (manual-sets.json): artist/Jules-provided dates the scrapers miss. Kept as source='manual', never overwritten.
let MANUAL=[];try{MANUAL=(require('./manual-sets.json').sets||[]).filter(m=>m&&/^\d{4}-\d{2}-\d{2}$/.test(m.date)&&m.bar&&m.band&&/^\d\d:\d\d$/.test(m.start));}catch(e){console.error('[lineup] manual-sets',e.message)}
// Night-relative minutes (sets starting before 6 AM belong to the previous night) and "same set" test (starts within 90 min).
const nMin=t=>{const [h,m]=String(t).split(':').map(Number);return (h<6?h+24:h)*60+(m||0);};
const near=(a,b)=>Math.abs(nMin(a)-nMin(b))<=90;
const normName=s=>String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\b(the|and)\b/g,' ').replace(/\s+/g,' ').trim();
// Band ids for a manual act: exact (case-insensitive) name plus any band whose normalized name matches.
function bandIdsFor(name,bid){const n=normName(name),ids=new Set([bid]);if(n)for(const b of db.prepare('SELECT id,name FROM bands').all())if(normName(b.name)===n)ids.add(b.id);return [...ids];}
// True if a manual set already covers this scraped listing (same bar/night/artist, start within 90 min): the artist's own times win.
function manualCovers(bar,date,name,start){if(!MANUAL.length)return false;const n=normName(name);
 return MANUAL.some(m=>m.bar===bar&&m.date===date&&normName(m.band)===n&&near(m.start,start));}
const rated=id=>!!db.prepare('SELECT 1 FROM ratings WHERE set_id=? LIMIT 1').get(id);
// Blank stage = main floor (fills the grid, same as before). A name is another floor
// (Rooftop, 2nd Floor, 3rd Floor, …). Those rows are added beside the main floor.
function manualStage(m){const s=m&&m.stage==null?'':String(m.stage).trim();return s?s.slice(0,80):null;}
function stageSlug(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,32)||'stage';}
// undefined = "end" omitted (keep the grid slot's end). null = published with no end time.
function manualEnd(m){if(!m||!Object.prototype.hasOwnProperty.call(m,'end'))return undefined;return /^\d\d:\d\d$/.test(m.end)?m.end:null;}
function chosenEnd(specified,fallback){const v=specified===undefined?fallback:specified;return v==null?null:v;}
function manualNote(m){if(!m||typeof m.note!=='string')return null;const n=m.note.trim().slice(0,160);return n||null;}
// Stamp only when a manual set has a note. Rows without one are left unchanged.
function stampManualNotes(fromDate){const rows=MANUAL.filter(m=>manualNote(m)&&m.date>=fromDate);if(!rows.length)return;
 const bars=new Set(db.prepare('SELECT id FROM bars').all().map(b=>b.id));
 const upd=db.prepare("UPDATE sets SET note=? WHERE bar_id=? AND date=? AND band_id=? AND set_start=? AND COALESCE(stage,'')=?");
 db.transaction(()=>{for(const m of rows){if(!bars.has(m.bar))continue;upd.run(manualNote(m),m.bar,m.date,bandIdFor(m.band),m.start,manualStage(m)||'');}})();}
// Add the stage row, and leave TBA / main-floor rows alone, when a stage-less manual
// set already occupies this slot. Otherwise the set fills the open grid slot (so the
// night does not grow a TBA hole) and keeps its stage name.
function isExtraStage(m){const stage=manualStage(m);if(!stage)return false;const si=slotFor(+String(m.start).slice(0,2));
 return MANUAL.some(o=>o!==m&&o.bar===m.bar&&o.date===m.date&&!manualStage(o)&&slotFor(+String(o.start).slice(0,2))===si);}
function upsertExtraStage(m,bid){const stage=manualStage(m),si=slotFor(+m.start.slice(0,2)),end=manualEnd(m);
 const sid=`${m.date}-${m.bar}-st-${stageSlug(stage)}-${m.start.replace(':','')}-${bid}`;
 const cur=db.prepare('SELECT set_end FROM sets WHERE id=?').get(sid);
 const setEnd=chosenEnd(end,cur&&cur.set_end);
 if(cur){db.prepare("UPDATE sets SET band_id=?,set_start=?,set_end=?,stage=?,source='manual',source_url=NULL WHERE id=?").run(bid,m.start,setEnd,stage,sid);return 0;}
 return db.prepare("INSERT INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,source_url,stage) VALUES(?,?,?,?,?,?,?,'manual',NULL,?)").run(sid,m.bar,bid,m.date,m.start,setEnd,`${m.date}-slot${si}`,stage).changes;}
// Same bar/date/band/start: keep the bar's own source over aggregator copies (nashvillelineup).
function hostOf(s){const m=String(s||'').match(/https?:\/\/(?:www\.)?([^\/\s]+)/i);return m?m[1].toLowerCase():'';}
function barHost(bar){const row=require('./bars').BARS.find(b=>b[0]===bar);return hostOf(row&&row[3]);}
function isAggregatorSource(src){const s=String(src||'').toLowerCase(),h=hostOf(src);
 return h==='nashvillelineup.com'||/\bnashville ?lineup(?:\.com)?\b/.test(s);}
function isBarOwnSource(m){const h=hostOf(m&&m.source),bh=barHost(m&&m.bar);return!!(h&&bh&&(h===bh||h.endsWith('.'+bh)||bh.endsWith('.'+h)));}
function manualRank(m){return isBarOwnSource(m)?2:isAggregatorSource(m&&m.source)?0:1;}
function preferManual(a,b){if(!a)return b;if(!b)return a;const ra=manualRank(a),rb=manualRank(b);return ra===rb?b:ra>rb?a:b;}
function manualKey(m){return m.bar+'|'+m.date+'|'+normName(m.band)+'|'+m.start;}
function dedupeManual(list){const map=new Map();for(const m of list||[]){const k=manualKey(m);if(!map.has(k)||preferManual(map.get(k),m)===m)map.set(k,m);}return[...map.values()];}
MANUAL=dedupeManual(MANUAL);
// Collapse leftover DB copies of the same manual set (e.g. a renamed stage left an old -st- row).
function collapseManualDupes(fromDate){const rows=db.prepare("SELECT id,bar_id,band_id,date,set_start,set_end,stage,source FROM sets WHERE date>=? AND band_id<>? AND COALESCE(source,'')<>'owner'").all(fromDate,TBA_ID);
 const groups=new Map();for(const r of rows){const k=r.bar_id+'\t'+r.date+'\t'+r.band_id+'\t'+r.set_start;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
 let n=0;for(const group of groups.values()){if(group.length<2)continue;const s=group[0];
  const man=MANUAL.find(m=>m.bar===s.bar_id&&m.date===s.date&&m.start===s.set_start&&bandIdsFor(m.band,bandIdFor(m.band)).includes(s.band_id));
  if(!man)continue;const stage=manualStage(man)||'',gid=`${man.date}-${man.bar}-${slotFor(+man.start.slice(0,2))}`;
  const keep=group.find(r=>rated(r.id))||(!isExtraStage(man)&&group.find(r=>r.id===gid))||group.find(r=>(r.stage||'')===stage)||group[0];
  const setEnd=chosenEnd(manualEnd(man),keep.set_end);
  db.prepare("UPDATE sets SET band_id=?,set_start=?,set_end=?,stage=?,source='manual',source_url=NULL WHERE id=?").run(bandIdFor(man.band),man.start,setEnd,manualStage(man),keep.id);n++;
  for(const r of group){if(r.id===keep.id||rated(r.id))continue;const gm=r.id.match(new RegExp('^'+man.date+'-'+man.bar+'-([0-3])$'));
   if(gm){const sl=SLOTS[+gm[1]];db.prepare("UPDATE sets SET band_id=?,set_start=?,set_end=?,stage=NULL,source='grid',source_url=NULL WHERE id=?").run(TBA_ID,sl[0],sl[1],r.id);}
   else db.prepare('DELETE FROM sets WHERE id=?').run(r.id);}}return n;}
// Manual rows for today or later that left manual-sets.json: grid slots go back to TBA, extras are deleted. Owner and rated rows stay.
function dropRemovedManual(fromDate){const rows=db.prepare("SELECT id,bar_id,band_id,date,set_start,stage FROM sets WHERE date>=? AND source='manual' AND band_id<>?").all(fromDate,TBA_ID);let n=0;
 for(const r of rows){if(rated(r.id))continue;const b=db.prepare('SELECT name FROM bands WHERE id=?').get(r.band_id);
  const name=normName(b&&b.name),st=String(r.stage||'').trim();
  if(MANUAL.some(m=>m.bar===r.bar_id&&m.date===r.date&&normName(m.band)===name&&near(m.start,r.set_start)&&(manualStage(m)||'')===st))continue;
  const gm=String(r.id).match(new RegExp('^'+r.date+'-'+r.bar_id+'-([0-3])$'));
  if(gm){const sl=SLOTS[+gm[1]];n+=db.prepare("UPDATE sets SET band_id=?,set_start=?,set_end=?,stage=NULL,source='grid',source_url=NULL WHERE id=?").run(TBA_ID,sl[0],sl[1],r.id).changes;}
  else n+=db.prepare('DELETE FROM sets WHERE id=?').run(r.id).changes;}
 return n;}
// Leftover TBA grid rows when a named set already fills that slot (e.g. a moved manual row kept its old slot id). Rated rows stay.
function dropCoveredTba(fromDate){let n=0;for(const r of db.prepare("SELECT id,bar_id,date FROM sets WHERE date>=? AND band_id=? AND COALESCE(source,'grid')='grid' AND id NOT IN (SELECT DISTINCT set_id FROM ratings WHERE set_id IS NOT NULL)").all(fromDate,TBA_ID)){const gm=String(r.id).match(new RegExp('^'+r.date+'-'+r.bar_id+'-([0-3])$'));if(gm&&slotTaken(r.bar_id,r.date,+gm[1],r.id))n+=db.prepare('DELETE FROM sets WHERE id=?').run(r.id).changes;}return n;}
// Retired scraped rows (source nmc) for today and later: grid slots return to the placeholder, extras are deleted.
// Manual, owner, and rated rows stay, and so do dates before fromDate.
function purgeRetiredListings(fromDate){const rows=db.prepare("SELECT id,bar_id,date FROM sets WHERE date>=? AND source='nmc' AND id NOT IN (SELECT DISTINCT set_id FROM ratings WHERE set_id IS NOT NULL)").all(fromDate);let n=0;
 for(const r of rows){const gm=String(r.id).match(new RegExp('^'+r.date+'-'+r.bar_id+'-([0-3])$'));
  if(gm){const sl=SLOTS[+gm[1]];n+=db.prepare("UPDATE sets SET band_id=?,set_start=?,set_end=?,stage=NULL,source='grid',source_url=NULL WHERE id=?").run(TBA_ID,sl[0],sl[1],r.id).changes;}
  else n+=db.prepare('DELETE FROM sets WHERE id=?').run(r.id).changes;}
 return n;}
function applyManual(fromDate){let n=0;for(const d of new Set(MANUAL.map(m=>m.date)))if(d>=fromDate)ensureDay(d);const bars=new Set(db.prepare('SELECT id FROM bars').all().map(b=>b.id));
 db.transaction(()=>{for(const m of MANUAL){if(m.date<fromDate||!bars.has(m.bar))continue;const bid=bandIdFor(m.band),si=slotFor(+m.start.slice(0,2)),end=manualEnd(m),stage=manualStage(m);
  if(isExtraStage(m)){n+=upsertExtraStage(m,bid);continue;}
  const mid=`${m.date}-${m.bar}-${si}-m-${bid}-${m.start.replace(':','')}`;
  const gid=`${m.date}-${m.bar}-${si}`;
  // Same artist at this bar/night starting within 90 min (scraped, or an earlier manual row on the same stage): merge into one row with the manual times. Owner rows stay.
  const ids=bandIdsFor(m.band,bid);
  const existing=db.prepare(`SELECT id,set_start,set_end,source,stage FROM sets WHERE bar_id=? AND date=? AND band_id IN (${ids.map(()=>'?').join(',')}) AND id<>? AND COALESCE(source,'')<>'owner'`).all(m.bar,m.date,...ids,mid);
  let dupes=existing.filter(r=>near(r.set_start,m.start)&&(r.source!=='manual'||String(r.stage||'').trim()===(stage||'')));
  // Only one set for this artist at this bar/night, and the start moved more than 90 min: still that row (stage may also have been renamed).
  if(!dupes.length&&existing.length&&existing.every(r=>!near(r.set_start,m.start))&&MANUAL.filter(o=>o.bar===m.bar&&o.date===m.date&&normName(o.band)===normName(m.band)).length===1)dupes=existing;
  if(dupes.length){const hasMid=!!db.prepare('SELECT 1 FROM sets WHERE id=?').get(mid);
   const keep=(dupes.find(r=>rated(r.id))||{}).id||(hasMid?mid:dupes[0].id);
   const ke=db.prepare('SELECT set_end FROM sets WHERE id=?').get(keep).set_end;
   db.prepare("UPDATE sets SET band_id=?,set_start=?,set_end=?,stage=?,source='manual',source_url=NULL WHERE id=?").run(bid,m.start,chosenEnd(end,ke),stage,keep);
   for(const id of [...dupes.map(r=>r.id),mid])if(id!==keep&&!rated(id)){const gm=id.match(new RegExp(`^${m.date}-${m.bar}-([0-3])$`));
    if(gm){const sl=SLOTS[+gm[1]];db.prepare("UPDATE sets SET band_id=?,set_start=?,set_end=?,stage=NULL,source='grid',source_url=NULL WHERE id=?").run(TBA_ID,sl[0],sl[1],id);} // grid slot rows go back to TBA, never deleted
    else db.prepare('DELETE FROM sets WHERE id=?').run(id);}
   continue;}
  if(stage){
   const g=db.prepare('SELECT band_id,source,set_start,set_end,stage FROM sets WHERE id=?').get(gid);
   const gStage=g?String(g.stage||'').trim():'';
   const claim=g&&g.source!=='owner'&&(g.band_id===TBA_ID||(g.band_id===bid&&g.set_start===m.start&&(gStage===''||gStage===stage)));
   if(claim){n+=db.prepare("UPDATE sets SET band_id=?,set_start=?,set_end=?,stage=?,source='manual',source_url=NULL WHERE id=?").run(bid,m.start,chosenEnd(end,g.set_end),stage,gid).changes;
    db.prepare("DELETE FROM sets WHERE bar_id=? AND date=? AND band_id=? AND set_start=? AND id<>? AND COALESCE(stage,'')='' AND COALESCE(source,'')<>'owner' AND id NOT IN (SELECT DISTINCT set_id FROM ratings WHERE set_id IS NOT NULL)").run(m.bar,m.date,bid,m.start,gid);
    if(mid!==gid&&!rated(mid))db.prepare('DELETE FROM sets WHERE id=?').run(mid);
    continue;}
   // Older runs stored a staged set on a blank-stage row. Reuse it instead of inserting a second copy.
   const legacy=db.prepare("SELECT id,set_end FROM sets WHERE bar_id=? AND date=? AND band_id=? AND set_start=? AND COALESCE(stage,'')='' AND COALESCE(source,'')<>'owner'").get(m.bar,m.date,bid,m.start);
   if(legacy){n+=db.prepare("UPDATE sets SET set_end=?,stage=?,source='manual',source_url=NULL WHERE id=?").run(chosenEnd(end,legacy.set_end),stage,legacy.id).changes;continue;}
   const same=db.prepare('SELECT id,set_end FROM sets WHERE bar_id=? AND date=? AND band_id=? AND set_start=? AND stage=?').get(m.bar,m.date,bid,m.start,stage);
   if(same){const setEnd=chosenEnd(end,same.set_end);if(setEnd!==same.set_end)db.prepare('UPDATE sets SET set_end=? WHERE id=?').run(setEnd,same.id);continue;}
   n+=db.prepare("INSERT INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,source_url,stage) VALUES(?,?,?,?,?,?,?,'manual',NULL,?)").run(mid,m.bar,bid,m.date,m.start,chosenEnd(end,null),`${m.date}-slot${si}`,stage).changes;
   continue;}
  const other=db.prepare("SELECT id,set_end FROM sets WHERE bar_id=? AND date=? AND band_id=? AND set_start=? AND id<>? AND COALESCE(stage,'')=''").get(m.bar,m.date,bid,m.start,mid);
  if(other){db.prepare('DELETE FROM sets WHERE id=? AND id NOT IN (SELECT DISTINCT set_id FROM ratings WHERE set_id IS NOT NULL)').run(mid);const setEnd=chosenEnd(end,other.set_end);if(setEnd!==other.set_end)db.prepare('UPDATE sets SET set_end=? WHERE id=?').run(setEnd,other.id);continue;}
  const g=db.prepare('SELECT band_id,source,set_end FROM sets WHERE id=?').get(gid);
  if(g&&g.band_id===TBA_ID&&g.source!=='owner'){n+=db.prepare("UPDATE sets SET band_id=?,set_start=?,set_end=?,stage=NULL,source='manual',source_url=NULL WHERE id=?").run(bid,m.start,chosenEnd(end,g.set_end),gid).changes;continue;}
  n+=db.prepare("INSERT OR IGNORE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,source_url) VALUES(?,?,?,?,?,?,?,'manual',NULL)").run(mid,m.bar,bid,m.date,m.start,chosenEnd(end,null),`${m.date}-slot${si}`).changes;}})();applyClosures(fromDate);collapseManualDupes(fromDate);dropRemovedManual(fromDate);dropCoveredTba(fromDate);stampManualNotes(fromDate);return n;}
// Pull listings for one or more nights; owner-edited sets are never overwritten.
let running=null,last=null;
async function refresh(dates){if(running)return running;running=(async()=>{const res={at:new Date().toISOString(),dates,bars:{},errors:[]};
 try{purgeRetiredListings(S.ctNight())}catch(e){res.errors.push('purge: '+e.message)}
 for(const d of dates){ensureDay(d);clearSampleBands(d);
  // placeholder listings like "TBD-Stage" are not real acts
  db.prepare("DELETE FROM sets WHERE date=? AND id GLOB '*-x*' AND band_id IN (SELECT id FROM bands WHERE name LIKE 'TBD%' OR name LIKE 'TBA%') AND band_id<>? AND id NOT IN (SELECT DISTINCT set_id FROM ratings WHERE set_id IS NOT NULL)").run(d,TBA_ID);
  db.prepare("DELETE FROM sets WHERE date=? AND id GLOB '*-x*' AND id NOT IN (SELECT DISTINCT set_id FROM ratings WHERE set_id IS NOT NULL) AND EXISTS (SELECT 1 FROM sets t WHERE t.bar_id=sets.bar_id AND t.date=sets.date AND t.band_id=sets.band_id AND t.set_start=sets.set_start AND t.id<sets.id)").run(d);
  db.prepare("UPDATE sets SET band_id=?,source='grid',source_url=NULL WHERE date=? AND band_id IN (SELECT id FROM bands WHERE name LIKE 'TBD%' OR name LIKE 'TBA%') AND band_id<>?").run(TBA_ID,d,TBA_ID);}
 const bars=db.prepare('SELECT id,name FROM bars').all();
 for(const b of bars){const per={},used0={};let src=null,diags=[];
  for(const d of dates){let r;try{r=await SRC.barEvents(b.id,d)}catch(e){res.errors.push(b.id+': '+e.message);continue;}
   diags=r.diags;if(r.source)src=r.source;const evs=r.events.slice().sort((x,y)=>(x.start<'03:00'?'24'+x.start:x.start).localeCompare(y.start<'03:00'?'24'+y.start:y.start));
   // Tonight: sources drop sets that already started or finished, so never downgrade tonight's
   // already-listed acts to TBA or delete them; only add/replace. Future nights get a full resync.
   const keep=(d===S.ctNight());if(keep&&!evs.length){per[d]=0;continue;}
   db.transaction(()=>{
    if(!keep)db.prepare("DELETE FROM sets WHERE bar_id=? AND date=? AND source=? AND id GLOB '*-x*' AND id NOT IN (SELECT DISTINCT set_id FROM ratings WHERE set_id IS NOT NULL)").run(b.id,d,BAR_SOURCE);
    const used={};let n=0;
    for(const e of evs){const name=e.name.slice(0,80),st=e.start,en=e.end,si=slotFor(+st.slice(0,2));const k=used[si]=(used[si]||0)+1;
     if(manualCovers(b.id,d,name,st))continue;
     const gid=`${d}-${b.id}-${si}`,g=db.prepare('SELECT * FROM sets WHERE id=?').get(gid);if(!g||g.source==='owner')continue;
     if(keep){const bid=bandIdFor(name);if(db.prepare('SELECT id FROM sets WHERE bar_id=? AND date=? AND band_id=? AND set_start=?').get(b.id,d,bid,st))continue;
      if(g.band_id===TBA_ID)db.prepare("UPDATE sets SET band_id=?,set_start=?,set_end=?,source=?,source_url=? WHERE id=?").run(bid,st,en,BAR_SOURCE,e.url,gid);
      else db.prepare("INSERT OR IGNORE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,source_url) VALUES(?,?,?,?,?,?,?,?,?)").run(`${gid}-x-${bid}-${st.replace(':','')}`,b.id,bid,d,st,en,`${d}-slot${si}`,BAR_SOURCE,e.url);
      n++;continue;}
     if(k===1&&g.source!=='manual'){db.prepare("UPDATE sets SET band_id=?,set_start=?,set_end=?,source=?,source_url=? WHERE id=?").run(bandIdFor(name),st,en,BAR_SOURCE,e.url,gid);n++;}
     else{db.prepare("INSERT OR REPLACE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,source_url) VALUES(?,?,?,?,?,?,?,?,?)").run(`${gid}-x${k}`,b.id,bandIdFor(name),d,st,en,`${d}-slot${si}`,BAR_SOURCE,e.url);n++;}}
    if(!keep)for(let si=0;si<4;si++)if(!used[si])db.prepare("UPDATE sets SET band_id=?,set_start=?,set_end=?,source='grid',source_url=NULL WHERE id=? AND source=?").run(TBA_ID,SLOTS[si][0],SLOTS[si][1],`${d}-${b.id}-${si}`,BAR_SOURCE);
    per[d]=n;})();}
  res.bars[b.id]={listed:per,source:src&&src.url,sourceType:src&&src.type,tried:diags};}
 try{applyManual(S.ctNight())}catch(e){res.errors.push('manual: '+e.message)}
 last=res;console.log('[lineup] refresh',JSON.stringify({dates,errors:res.errors}));return res;})();
 try{return await running}finally{running=null}}
function start(){const tick=()=>{try{const n=S.ctNight();purgeRetiredListings(n);ensureDay(n);ensureDay(nextNight(n));clearSampleBands(n);applyManual(n);}catch(e){console.error('[lineup] grid',e)}};
 tick();setInterval(tick,5*60e3); // night flip at 3 AM CT: grid for the new night appears within 5 min (and a day ahead)
 const run=()=>{const n=S.ctNight();refresh([n,nextNight(n)]).catch(e=>console.error('[lineup] refresh',e));};
 setTimeout(run,15e3);setInterval(run,H);} // hourly while awake; also runs ~15s after every boot/wake
module.exports={applyManual,applyClosures,collapseManualDupes,dropRemovedManual,dropCoveredTba,purgeRetiredListings,dedupeManual,preferManual,isBarOwnSource,isAggregatorSource,isClosed,ensureDay,refresh,start,clearSampleBands,nextNight,status:()=>last,BAR_SOURCE};
