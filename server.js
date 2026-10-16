const express=require('express'),cookieParser=require('cookie-parser'),crypto=require('crypto'),path=require('path');
const db=require('./db'),S=require('./scoring');
try{if(!db.prepare('SELECT COUNT(*) c FROM bars').get().c){console.log('Empty DB, seeding');require('./scripts/seed.js');}}catch(e){console.error('seed failed',e)}
const app=express();app.use(express.json());app.use(cookieParser());app.set('trust proxy','loopback');
app.use((req,res,next)=>{let d=req.cookies.device_id;if(!d){d=crypto.randomUUID();res.cookie('device_id',d,{maxAge:365*864e5,httpOnly:true,sameSite:'lax'});}req.deviceId=d;
 req.ipHash=crypto.createHash('sha256').update(String(req.ip)).digest('hex');next();}); // raw IP never stored
app.use(express.static(path.join(__dirname,'public')));
app.get('/api/lineup',(req,res)=>{const date=(!req.query.date||req.query.date==='today')?S.ctNight():req.query.date;
 const rows=db.prepare(`SELECT s.*,b.name bar,bd.name band FROM sets s JOIN bars b ON b.id=s.bar_id JOIN bands bd ON bd.id=s.band_id WHERE s.date=? ORDER BY b.name,s.set_start`).all(date);
 const mine=new Set(db.prepare('SELECT set_id FROM ratings WHERE device_id=?').all(req.deviceId).map(r=>r.set_id));
 res.json({date,sets:rows.map(r=>({...r,ratedByMe:mine.has(r.id)}))});});
const VIBES=new Set(['loud','chill','packed','dancing','tipsy']);
function vibesForBars(barIds,windowH){
 const now=Date.now();const ids=barIds.length?barIds:[''];
 const rows=db.prepare(`SELECT bar_id,vibe,COUNT(*) c FROM ratings WHERE hidden=0 AND vibe IS NOT NULL AND vibe!='' AND created_at>=? AND bar_id IN (${ids.map(()=>'?').join(',')}) GROUP BY bar_id,vibe`).all(now-windowH*S.H,...ids);
 const map={};for(const r of rows){(map[r.bar_id]=map[r.bar_id]||[]).push({vibe:r.vibe,n:r.c});}
 for(const k of Object.keys(map))map[k].sort((a,b)=>b.n-a.n);
 return map;
}
function withVibes(list,windowH){
 const map=vibesForBars(list.map(x=>x.barId),windowH);
 return list.map(x=>({...x,vibes:(map[x.barId]||[]).slice(0,3).map(v=>v.vibe)}));
}
app.post('/api/ratings',(req,res)=>{const {barId,bandId,setId,rating,checkIn,vibe}=req.body||{};const now=Date.now();
 const r=Number(rating);if(!Number.isInteger(r)||r<1||r>5)return res.status(400).json({error:'rating must be 1-5'});
 const v=(vibe==null||vibe==='')?null:String(vibe).toLowerCase();
 if(v&&!VIBES.has(v))return res.status(400).json({error:'vibe must be loud, chill, packed, dancing, or tipsy'});
 const set=db.prepare('SELECT * FROM sets WHERE id=?').get(setId);if(!set||set.bar_id!==barId||set.band_id!==bandId)return res.status(400).json({error:'unknown set'});
 const d=req.deviceId;
 if(db.prepare('SELECT COUNT(*) c FROM ratings WHERE device_id=? AND created_at>?').get(d,now-S.H).c>=3)return res.status(429).json({error:'Limit: 3 ratings per hour'});
 const nights=db.prepare('SELECT created_at FROM ratings WHERE device_id=? AND created_at>?').all(d,now-36*S.H).filter(x=>S.ctNight(x.created_at)===S.ctNight(now)).length;
 if(nights>=10)return res.status(429).json({error:'Limit: 10 ratings per night'});
 const ipCount=db.prepare('SELECT COUNT(*) c FROM ratings WHERE ip_hash=? AND created_at>?').get(req.ipHash,now-S.H).c;
 const hidden=ipCount>=3?1:0;
 try{db.prepare('INSERT INTO ratings(bar_id,band_id,set_id,set_window_id,rating,device_id,ip_hash,check_in,created_at,hidden,vibe) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(barId,bandId,setId,set.set_window_id,r,d,req.ipHash,checkIn?1:0,now,hidden,v);}
 catch(e){if(String(e).includes('UNIQUE'))return res.status(409).json({error:'Already rated this set'});throw e;}
 spikeCheck(barId,now);res.json({ok:true,softHidden:!!hidden,vibe:v});});
function spikeCheck(bar,now){const q=(a,b)=>db.prepare('SELECT COUNT(*) c,AVG(rating) a FROM ratings WHERE bar_id=? AND hidden=0 AND created_at>=? AND created_at<?').get(bar,a,b);
 const total=q(now-6*S.H,now+1).c,before=q(now-6*S.H,now-0.5*S.H).c;
 const cur=q(now-S.H,now+1),prev=q(now-2*S.H,now-S.H);let why=[];
 if(before>0&&total>=2*before)why.push('N doubled <30min');if(cur.a!=null&&prev.a!=null&&cur.a-prev.a>1)why.push('avg +1.0 vs prior hour');
 if(why.length&&!db.prepare('SELECT 1 FROM review_queue WHERE bar_id=? AND created_at>?').get(bar,now-S.H))db.prepare('INSERT INTO review_queue(bar_id,reason,created_at) VALUES(?,?,?)').run(bar,why.join('; '),now);}
let cache={};const cached=(k,ms,f)=>{const c=cache[k];if(c&&Date.now()-c.t<ms)return c.v;const v=f();cache[k]={t:Date.now(),v};return v;};
app.use('/api',(req,res,next)=>{if(req.method==='POST')cache={};next();});
app.get('/api/leaderboards/tonight',(q,r)=>r.json(cached('t',60e3,()=>withVibes(S.tonight().map(s=>s.visible?s:{...s,score:null,base:null,label:'Not enough ratings yet'}),6))));
app.get('/api/leaderboards/week',(q,r)=>r.json(cached('w',60e3,()=>withVibes(S.week(),7*24))));// spec says hourly; 1 min for demo
app.get('/api/leaderboards/streak',(q,r)=>r.json(cached('s',60e3,()=>withVibes(S.streaks(),7*24))));
app.get('/api/bars/:id/score',(q,r)=>r.json({tonight:S.tonight().find(s=>s.barId===q.params.id),week:S.week().find(s=>s.barId===q.params.id)}));
app.get('/api/featured',(q,r)=>r.json(db.prepare('SELECT sp.*,b.name,b.address FROM sponsors sp JOIN bars b ON b.id=sp.bar_id WHERE day=? LIMIT 3').all(S.ctNight()).map(x=>({...x,sponsored:true,label:'Sponsored'}))));
app.get('/api/bars/:id',(req,res)=>{const id=req.params.id;const bar=db.prepare('SELECT * FROM bars WHERE id=?').get(id);if(!bar)return res.status(404).json({error:'unknown bar'});
 const date=S.ctNight();const mine=new Set(db.prepare('SELECT set_id FROM ratings WHERE device_id=?').all(req.deviceId).map(r=>r.set_id));
 const sets=db.prepare(`SELECT s.*,bd.name band FROM sets s JOIN bands bd ON bd.id=s.band_id WHERE s.bar_id=? AND s.date=? ORDER BY s.set_start`).all(id,date).map(r=>({...r,ratedByMe:mine.has(r.id)}));
 const t=S.tonight().find(x=>x.barId===id);const tonight=t&&!t.visible?{...t,score:null,base:null,label:'Not enough ratings yet'}:t||null;
 const sponsored=!!db.prepare('SELECT 1 FROM sponsors WHERE bar_id=? AND day=?').get(id,date);
 res.json({...bar,date,sponsored,tonight,week:S.week().find(x=>x.barId===id)||null,vibes:(vibesForBars([id],6)[id]||[]),sets});});


// ---- competitive: now / street / pulse / search ----
const STREET_ORDER={acme:1,wildhorse:2,luke32:3,aldeans:4,honkytonkcentral:5,bootbarn:6,roberts:7,layla:8,tootsies:9,legends:10};
function ctHM(t=Date.now()){
  const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t));
  const h=p.find(x=>x.type==='hour').value.padStart(2,'0'),m=p.find(x=>x.type==='minute').value.padStart(2,'0');
  return h+':'+m;
}
function toMin(t){const [h,m]=String(t).split(':').map(Number);return h*60+m;}
function inSet(nowHM,start,end){
  const n=toMin(nowHM),s=toMin(start),e=toMin(end);
  if(e<=s)return n>=s||n<e; // crosses midnight (e.g. 22:00–02:00)
  return n>=s&&n<e;
}
function lastCallHint(sets){
  if(!sets||!sets.length)return null;
  // pick latest set_end treating overnight ends (< noon) as after midnight
  let best=null,bestKey=-1;
  for(const s of sets){const e=toMin(s.set_end);const key=e<12*60?e+24*60:e;if(key>bestKey){bestKey=key;best=s;}}
  return best?{lastEnd:best.set_end,label:`Music til ~${best.set_end} · last call ~30 min before`}:null;
}
function hourCounts(windowH){
  const now=Date.now();
  const rows=db.prepare('SELECT bar_id,COUNT(*) c FROM ratings WHERE hidden=0 AND created_at>=? GROUP BY bar_id').all(now-windowH*S.H);
  return Object.fromEntries(rows.map(r=>[r.bar_id,r.c]));
}
app.get('/api/now',(req,res)=>{
  const date=S.ctNight(), hm=ctHM();
  const rows=db.prepare(`SELECT s.*,b.name bar,b.address,bd.name band FROM sets s JOIN bars b ON b.id=s.bar_id JOIN bands bd ON bd.id=s.band_id WHERE s.date=?`).all(date);
  const live=rows.filter(r=>inSet(hm,r.set_start,r.set_end))
    .sort((a,b)=>(STREET_ORDER[a.bar_id]||99)-(STREET_ORDER[b.bar_id]||99))
    .map(r=>({barId:r.bar_id,bar:r.bar,address:r.address,band:r.band,bandId:r.band_id,setId:r.id,set_start:r.set_start,set_end:r.set_end,streetOrder:STREET_ORDER[r.bar_id]||99}));
  res.json({date,ctTime:hm,nowPlaying:live});
});
app.get('/api/pulse',(req,res)=>{
  const now=Date.now();
  const h1=db.prepare('SELECT COUNT(*) c FROM ratings WHERE hidden=0 AND created_at>=?').get(now-S.H).c;
  const h6=db.prepare('SELECT COUNT(*) c FROM ratings WHERE hidden=0 AND created_at>=?').get(now-6*S.H).c;
  const windowH=h1>0?1:6, total=h1>0?h1:h6;
  const byBar=hourCounts(windowH);
  const vibeRows=db.prepare(`SELECT vibe,COUNT(*) c FROM ratings WHERE hidden=0 AND vibe IS NOT NULL AND vibe!='' AND created_at>=? GROUP BY vibe ORDER BY c DESC LIMIT 5`).all(now-windowH*S.H);
  res.json({windowHours:windowH,ratings:total,byBar,topVibes:vibeRows.map(v=>v.vibe),label:total?`${total} rating${total===1?'':'s'} in the last ${windowH===1?'hour':windowH+' hours'} on Broadway`:'Be the first to rate a set tonight'});
});
app.get('/api/street',(req,res)=>{
  const date=S.ctNight(), hm=ctHM();
  const tonight=Object.fromEntries(S.tonight().map(s=>[s.barId,s]));
  const bars=db.prepare('SELECT * FROM bars').all().sort((a,b)=>(STREET_ORDER[a.id]||99)-(STREET_ORDER[b.id]||99));
  const vibes=vibesForBars(bars.map(b=>b.id),6);
  const counts=hourCounts(6);
  const setsAll=db.prepare(`SELECT s.*,bd.name band FROM sets s JOIN bands bd ON bd.id=s.band_id WHERE s.date=?`).all(date);
  const byBar={};for(const s of setsAll){(byBar[s.bar_id]=byBar[s.bar_id]||[]).push(s);}
  const list=bars.map(b=>{
    const sets=byBar[b.id]||[];
    const now=sets.find(s=>inSet(hm,s.set_start,s.set_end));
    const t=tonight[b.id];
    const lc=lastCallHint(sets);
    const vs=(vibes[b.id]||[]).slice(0,3);
    const pulse=vs.length?vs.map(v=>v.vibe).join(' · '):null;
    return {
      barId:b.id,name:b.name,address:b.address,streetOrder:STREET_ORDER[b.id]||99,
      score:t&&t.visible?t.score:null,n:t?t.n:0,visible:!!(t&&t.visible),
      vibes:vs.map(v=>v.vibe),pulse,ratingsLast6h:counts[b.id]||0,
      nowPlaying:now?{band:now.band,set_start:now.set_start,set_end:now.set_end}:null,
      lastCall:lc
    };
  });
  res.json({date,ctTime:hm,bars:list});
});
app.get('/api/search',(req,res)=>{
  const q=String(req.query.q||'').trim().toLowerCase();
  if(q.length<2)return res.json({q,matches:[]});
  const date=S.ctNight();
  const rows=db.prepare(`SELECT s.*,b.name bar,b.address,bd.name band FROM sets s JOIN bars b ON b.id=s.bar_id JOIN bands bd ON bd.id=s.band_id WHERE s.date=? AND lower(bd.name) LIKE ? ORDER BY s.set_start`).all(date,'%'+q+'%');
  const hm=ctHM();
  res.json({q,date,matches:rows.map(r=>({barId:r.bar_id,bar:r.bar,address:r.address,band:r.band,set_start:r.set_start,set_end:r.set_end,live:inSet(hm,r.set_start,r.set_end)}))});
});
// ---- owner magic links ----
const ownerBar=t=>{const r=db.prepare('SELECT bar_id FROM owner_tokens WHERE token=?').get(String(t||''));return r&&db.prepare('SELECT id,name,address FROM bars WHERE id=?').get(r.bar_id);};
const ownerSets=(bar,date)=>db.prepare('SELECT s.id,s.set_start,s.set_end,s.band_id,b.name band FROM sets s LEFT JOIN bands b ON b.id=s.band_id WHERE s.bar_id=? AND s.date=? ORDER BY s.set_start').all(bar,date);
app.get('/api/owner/:token',(req,res)=>{const bar=ownerBar(req.params.token);if(!bar)return res.status(404).json({error:'invalid link'});const date=S.ctNight();
 const c=db.prepare('SELECT email,phone FROM owner_contacts WHERE bar_id=?').get(bar.id)||null;res.json({bar,date,contact:c,sets:ownerSets(bar.id,date)});});
app.post('/api/owner/:token',(req,res)=>{const bar=ownerBar(req.params.token);if(!bar)return res.status(404).json({error:'invalid link'});const date=S.ctNight();
 const {contact,sets}=req.body||{};if(sets&&!Array.isArray(sets))return res.status(400).json({error:'sets must be array'});
 const tm=v=>v==null||v===''?null:(/^\d{1,2}:\d{2}$/.test(String(v))?String(v).padStart(5,'0'):undefined);
 try{db.transaction(()=>{for(const x of sets||[]){const s=db.prepare('SELECT * FROM sets WHERE id=? AND bar_id=? AND date=?').get(x&&x.id,bar.id,date);if(!s)throw Object.assign(new Error('set not found for this bar tonight: '+(x&&x.id)),{code:400});
   const name=String(x.band||'').trim().slice(0,80);let bandId=s.band_id;
   if(name){const ex=db.prepare('SELECT id FROM bands WHERE lower(name)=lower(?)').get(name);if(ex)bandId=ex.id;else{bandId='b_'+(name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30)||'band')+'_'+crypto.randomBytes(3).toString('hex');db.prepare('INSERT INTO bands(id,name) VALUES(?,?)').run(bandId,name);}}
   const st=tm(x.set_start),en=tm(x.set_end);if(st===undefined||en===undefined)throw Object.assign(new Error('time must be HH:MM'),{code:400});
   db.prepare('UPDATE sets SET band_id=?,set_start=COALESCE(?,set_start),set_end=COALESCE(?,set_end) WHERE id=?').run(bandId,st,en,s.id);}
  if(contact&&typeof contact==='object'){const e=String(contact.email||'').trim().slice(0,120)||null,p=String(contact.phone||'').trim().slice(0,40)||null;
   db.prepare('INSERT INTO owner_contacts(bar_id,email,phone,updated_at) VALUES(?,?,?,?) ON CONFLICT(bar_id) DO UPDATE SET email=excluded.email,phone=excluded.phone,updated_at=excluded.updated_at').run(bar.id,e,p,Date.now());}
  db.prepare('UPDATE owner_tokens SET last_used_at=? WHERE token=?').run(Date.now(),req.params.token);})();}
 catch(e){return res.status(e.code||500).json({error:e.message});}
 cache={};res.json({ok:true});});
app.get('/owner/:token',(q,r)=>r.sendFile(path.join(__dirname,'public','owner.html')));
app.get('/bar/:id',(q,r)=>r.sendFile(path.join(__dirname,'public','index.html')));
app.get('/api/admin/review',(q,r)=>r.json(db.prepare('SELECT * FROM review_queue ORDER BY id DESC').all()));
// streak snapshot: check every 5 min; snapshot previous night once after 3 AM CT
setInterval(()=>{try{const h=+new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',hourCycle:'h23'}).format(new Date());
 if(h===2){const day=S.ctNight();db.prepare('DELETE FROM daily_top5 WHERE day=?').run(day);S.snapshotTonight();}}catch(e){console.error(e)}},5*60e3); // final write in the 2-3 AM CT hour = 3 AM snapshot
const PORT=process.env.PORT||3847;app.listen(PORT,'0.0.0.0',()=>console.log('Broadway MVP on port '+PORT));
