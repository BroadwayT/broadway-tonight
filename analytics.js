// First-party page views and sponsor-link clicks.
// Stored in the same SQLite file as the rest of the app (DB_PATH / data/app.db).
// No cookies, no raw IP, no full user agent. A visitor id is sha256(daily salt + IP + UA).
// The salt is replaced each America/Chicago day and only the current day's salt is kept,
// so the hash cannot be linked across days or reversed later.
const crypto=require('crypto');
const express=require('express');

const TZ='America/Chicago';
const SOURCES=['instagram','tiktok','google','direct','other'];
const LINKS=new Set(['website','instagram','tickets','tip']);
const SELF_HOSTS=new Set(['broadwaytonightnash.com','broadway-tonight.onrender.com','localhost','127.0.0.1']);
const BOT=/bot|spider|crawl|slurp|facebookexternalhit|embedly|quora|pinterest|slackbot|discordbot|telegrambot|whatsapp|applebot|headless|phantomjs|puppeteer|lighthouse|pagespeed|pingdom|uptimerobot|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|amazonbot|yandex|baiduspider|duckduckbot|sogou|ia_archiver|bingpreview|linkedinbot|twitterbot|redditbot|curl\/|wget\/|python-requests|go-http-client|libwww|previewbot/i;

function ensure(db){
  db.exec(`CREATE TABLE IF NOT EXISTS pageviews(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    day TEXT NOT NULL,
    path TEXT NOT NULL,
    referrer TEXT,
    source TEXT NOT NULL,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    device TEXT NOT NULL,
    visitor TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS pageviews_day ON pageviews(day);
  CREATE TABLE IF NOT EXISTS outbound_clicks(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    day TEXT NOT NULL,
    bar TEXT,
    link_type TEXT NOT NULL,
    visitor TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS outbound_clicks_day ON outbound_clicks(day);
  CREATE TABLE IF NOT EXISTS analytics_salt(
    day TEXT PRIMARY KEY,
    salt TEXT NOT NULL
  );`);
}

function dayKey(ts){
  return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts));
}
function addDays(iso,n){
  const [y,m,d]=iso.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);
}
function isDate(s){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return false;
  const [y,m,d]=s.split('-').map(Number);
  const dt=new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d;
}
function eachDay(from,to){
  const out=[];
  let d=from;
  while(d<=to){
    out.push(d);
    d=addDays(d,1);
    if(out.length>366)break;
  }
  return out;
}
function isBot(ua){return BOT.test(String(ua||''));}
function deviceOf(ua){
  return /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini|webOS|BlackBerry/i.test(String(ua||''))?'mobile':'desktop';
}
function cleanTag(v){
  const s=String(v==null?'':v).trim().slice(0,80);
  if(!s||!/^[\w .+\-]{1,80}$/.test(s))return null;
  return s;
}
function normalizePath(raw){
  let p=String(raw==null?'':raw).trim();
  if(!p)return null;
  try{p=decodeURIComponent(p);}catch(e){return null;}
  p=p.split('?')[0].split('#')[0];
  if(p.includes('\\')||/\s/.test(p)||p.includes('..'))return null;
  if(!p.startsWith('/'))p='/'+p;
  p=p.replace(/\/{2,}/g,'/');
  if(p.length>1&&p.endsWith('/'))p=p.slice(0,-1);
  if(p.length>120)return null;
  const low=p.toLowerCase();
  if(low==='/'||low==='/lineup')return low;
  if(low.startsWith('/owner')||low.startsWith('/stats')||low.startsWith('/api'))return null;
  const bar=low.match(/^\/bar\/([a-z0-9_-]{1,40})$/);
  if(bar)return '/bar/'+bar[1];
  const band=low.match(/^\/band\/([a-z0-9_-]{1,80})$/);
  if(band)return '/band/'+band[1];
  return null;
}
function referrerDomain(raw,selfHost){
  const s=String(raw==null?'':raw).trim();
  if(!s)return null;
  let host='';
  try{
    const u=new URL(/^[a-z][a-z0-9+.-]*:/i.test(s)?s:'https://'+s);
    host=String(u.hostname||'').toLowerCase().replace(/\.$/,'').replace(/^www\./,'');
  }catch(e){return null;}
  if(!host||host.length>120||!/^[a-z0-9.-]+$/.test(host))return null;
  const self=String(selfHost||'').toLowerCase().replace(/^www\./,'');
  if(SELF_HOSTS.has(host)||(self&&host===self))return null;
  return host;
}
function bucketFromUtm(utm){
  const u=String(utm||'').trim().toLowerCase();
  if(!u)return null;
  if(/^(ig|insta|instagram|igstory|igfeed)$/.test(u))return 'instagram';
  if(/^(tt|tiktok|tik_tok)$/.test(u))return 'tiktok';
  if(/^google([_-]|$)/.test(u))return 'google';
  if(u==='direct'||u==='(direct)'||u==='none')return 'direct';
  return 'other';
}
function bucketFromUa(ua){
  const s=String(ua||'');
  if(/Instagram/i.test(s))return 'instagram';
  if(/TikTok|musical_ly|BytedanceWebview/i.test(s))return 'tiktok';
  if(/\bGSA\/|GoogleSearch/i.test(s))return 'google';
  return null;
}
function bucketFromHost(host){
  if(!host)return null;
  if(/(^|\.)instagram\.com$/.test(host))return 'instagram';
  if(/(^|\.)tiktok\.com$/.test(host))return 'tiktok';
  if(/(^|\.)google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(host)||/(^|\.)google\./.test(host))return 'google';
  return null;
}
function sourceOf(refDomain,utmSource,ua){
  return bucketFromUtm(utmSource)||bucketFromUa(ua)||(refDomain?(bucketFromHost(refDomain)||'other'):'direct');
}
function cleanLink(v){
  const s=String(v||'').trim().toLowerCase();
  return LINKS.has(s)?s:null;
}
function cleanBar(v){
  const s=String(v||'').trim().toLowerCase();
  if(!s)return '';
  return /^[a-z0-9_-]{1,40}$/.test(s)?s:'';
}
function clientIp(req){
  const raw=req&&req.headers&&(req.headers['x-forwarded-for']||req.headers['X-Forwarded-For'])||'';
  const first=String(raw).split(',')[0].trim();
  if(first&&/^[0-9a-fA-F:.]+$/.test(first)&&first.length<80)return first;
  return String(req&&req.ip||'');
}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function createAnalytics(db,opts){
  opts=opts||{};
  ensure(db);
  const nowFn=opts.now||Date.now;
  const tokenOf=()=>opts.token!=null?String(opts.token):(process.env.ANALYTICS_TOKEN||'');
  let saltMemo={day:'',salt:''};
  const hits=new Map();
  const insView=db.prepare('INSERT INTO pageviews(ts,day,path,referrer,source,utm_source,utm_medium,utm_campaign,device,visitor) VALUES(?,?,?,?,?,?,?,?,?,?)');
  const insClick=db.prepare('INSERT INTO outbound_clicks(ts,day,bar,link_type,visitor) VALUES(?,?,?,?,?)');

  function saltFor(day){
    if(saltMemo.day===day&&saltMemo.salt)return saltMemo.salt;
    const row=db.prepare('SELECT salt FROM analytics_salt WHERE day=?').get(day);
    if(row&&row.salt){saltMemo={day,salt:row.salt};return row.salt;}
    const salt=crypto.randomBytes(32).toString('hex');
    db.transaction(()=>{
      db.prepare('DELETE FROM analytics_salt').run();
      db.prepare('INSERT INTO analytics_salt(day,salt) VALUES(?,?)').run(day,salt);
    })();
    saltMemo={day,salt};
    return salt;
  }
  function visitorId(ip,ua,day){
    const salt=saltFor(day);
    return crypto.createHash('sha256').update(salt+'\n'+String(ip||'')+'\n'+String(ua||'').slice(0,300)).digest('hex').slice(0,32);
  }
  function limited(ip,ua){
    const key=crypto.createHash('sha256').update(String(ip||'')+'\n'+String(ua||'').slice(0,300)).digest('hex').slice(0,16);
    const t=nowFn();
    let arr=(hits.get(key)||[]).filter(x=>t-x<60000);
    if(arr.length>=60){hits.set(key,arr);return true;}
    arr.push(t);hits.set(key,arr);
    if(hits.size>4000){for(const [k,v] of hits){if(!v.length||t-v[v.length-1]>60000)hits.delete(k);}}
    return false;
  }
  function barName(id){
    if(!id)return '';
    try{const r=db.prepare('SELECT name FROM bars WHERE id=?').get(id);return r&&r.name||'';}catch(e){return '';}
  }
  function pageLabel(path){
    if(path==='/')return 'Home';
    if(path==='/lineup')return 'Lineup';
    if(path.startsWith('/bar/')){const id=path.slice(5);return barName(id)||id;}
    if(path.startsWith('/band/'))return 'Band · '+path.slice(6);
    return path;
  }

  function record(ev){
    ev=ev||{};
    const ua=String(ev.ua||'');
    if(isBot(ua))return {stored:false,reason:'bot'};
    let path=null,link=null,bar=null,ref=null,utm_source=null,utm_medium=null,utm_campaign=null,source=null,device=null;
    if(ev.kind==='click'){
      link=cleanLink(ev.link);
      if(!link)return {stored:false,reason:'link'};
      const barIn=String(ev.bar||'').trim();
      if(barIn&&!cleanBar(barIn))return {stored:false,reason:'bar'};
      bar=cleanBar(barIn);
    }else{
      path=normalizePath(ev.path);
      if(!path)return {stored:false,reason:'path'};
      ref=referrerDomain(ev.ref,ev.host);
      utm_source=cleanTag(ev.utm_source);
      utm_medium=cleanTag(ev.utm_medium);
      utm_campaign=cleanTag(ev.utm_campaign);
      source=sourceOf(ref,utm_source,ua);
      device=deviceOf(ua);
    }
    const ip=String(ev.ip||'');
    if(limited(ip,ua))return {stored:false,reason:'rate'};
    const ts=nowFn();
    const day=dayKey(ts);
    const visitor=visitorId(ip,ua,day);
    if(ev.kind==='click'){
      insClick.run(ts,day,bar||null,link,visitor);
      return {stored:true,kind:'click',day};
    }
    insView.run(ts,day,path,ref,source,utm_source,utm_medium,utm_campaign,device,visitor);
    return {stored:true,kind:'page',day,path,source,device};
  }

  function parseRange(query){
    const today=dayKey(nowFn());
    let from=String(query&&query.from||'').trim();
    let to=String(query&&query.to||'').trim();
    if(!from&&!to){to=today;from=addDays(today,-6);}
    else{if(!from)from=to;if(!to)to=from;}
    if(!isDate(from)||!isDate(to)){const e=new Error('from and to must be YYYY-MM-DD');e.status=400;throw e;}
    if(from>to){const e=new Error('from is after to');e.status=400;throw e;}
    const days=eachDay(from,to);
    if(days.length>366){const e=new Error('range is limited to 366 days');e.status=400;throw e;}
    return {from,to,days};
  }
  function stats(query){
    const {from,to,days}=parseRange(query||{});
    const views=db.prepare('SELECT COUNT(*) c, COUNT(DISTINCT visitor) v FROM pageviews WHERE day>=? AND day<=?').get(from,to);
    const byDay=db.prepare('SELECT day, COUNT(*) views, COUNT(DISTINCT visitor) visitors FROM pageviews WHERE day>=? AND day<=? GROUP BY day').all(from,to);
    const dayMap=Object.fromEntries(byDay.map(r=>[r.day,r]));
    const viewsPerDay=days.map(day=>({day,views:(dayMap[day]&&dayMap[day].views)||0,visitors:(dayMap[day]&&dayMap[day].visitors)||0}));
    const topPages=db.prepare('SELECT path, COUNT(*) views, COUNT(DISTINCT visitor) visitors FROM pageviews WHERE day>=? AND day<=? GROUP BY path ORDER BY views DESC, path LIMIT 25').all(from,to)
      .map(r=>({path:r.path,label:pageLabel(r.path),views:r.views,visitors:r.visitors}));
    const topBarPages=db.prepare("SELECT path, COUNT(*) views, COUNT(DISTINCT visitor) visitors FROM pageviews WHERE day>=? AND day<=? AND path LIKE '/bar/%' GROUP BY path ORDER BY views DESC, path LIMIT 25").all(from,to)
      .map(r=>{const bar=r.path.slice(5);return {bar,path:r.path,name:barName(bar)||bar,views:r.views,visitors:r.visitors};});
    const sourceRows=db.prepare('SELECT source, COUNT(*) c FROM pageviews WHERE day>=? AND day<=? GROUP BY source').all(from,to);
    const sources=Object.fromEntries(SOURCES.map(s=>[s,0]));
    for(const r of sourceRows)sources[r.source]=(sources[r.source]||0)+r.c;
    const referrers=db.prepare('SELECT referrer, COUNT(*) views FROM pageviews WHERE day>=? AND day<=? AND referrer IS NOT NULL GROUP BY referrer ORDER BY views DESC, referrer LIMIT 25').all(from,to);
    const utm=db.prepare(`SELECT utm_source source, utm_medium medium, utm_campaign campaign, COUNT(*) views
      FROM pageviews WHERE day>=? AND day<=? AND (utm_source IS NOT NULL OR utm_medium IS NOT NULL OR utm_campaign IS NOT NULL)
      GROUP BY utm_source, utm_medium, utm_campaign ORDER BY views DESC LIMIT 25`).all(from,to)
      .map(r=>({source:r.source||'',medium:r.medium||'',campaign:r.campaign||'',views:r.views}));
    const deviceRows=db.prepare('SELECT device, COUNT(*) c FROM pageviews WHERE day>=? AND day<=? GROUP BY device').all(from,to);
    const devices={mobile:0,desktop:0};
    for(const r of deviceRows)if(r.device==='mobile'||r.device==='desktop')devices[r.device]=r.c;
    const clicks=db.prepare('SELECT bar, link_type link, COUNT(*) clicks FROM outbound_clicks WHERE day>=? AND day<=? GROUP BY bar, link_type ORDER BY clicks DESC, bar, link_type LIMIT 50').all(from,to)
      .map(r=>({bar:r.bar||'',name:r.bar?barName(r.bar)||r.bar:'',link:r.link,clicks:r.clicks}));
    return {
      from,to,timezone:TZ,
      views:views.c,visitors:views.v,
      visitorsNote:'Counted once per day. Someone who comes back on another day counts again, because the visitor id rotates daily and the salt is not kept.',
      viewsPerDay,topPages,topBarPages,sources,referrers,utm,devices,clicks
    };
  }

  function presentedToken(req){
    const h=req.get?req.get('x-analytics-token'):'';
    if(h)return String(h);
    const auth=String((req.get&&req.get('authorization'))||'');
    const m=auth.match(/^Bearer\s+(\S+)\s*$/i);
    if(m)return m[1];
    const q=req.query&&req.query.token;
    if(Array.isArray(q))return '';
    return q?String(q):'';
  }
  function gate(req){
    const want=tokenOf();
    if(!want)return 'disabled';
    const got=Buffer.from(presentedToken(req));
    const need=Buffer.from(want);
    if(got.length!==need.length||got.length===0)return 'no';
    return crypto.timingSafeEqual(got,need)?'ok':'no';
  }
  function sendDenied(res,state,html){
    if(state==='disabled'){
      res.status(404);
      return html?res.type('text/plain').send('Not found'):res.json({error:'not found'});
    }
    res.status(401);
    return html?res.type('text/plain').send('Unauthorized'):res.json({error:'unauthorized'});
  }
  function noStore(res){
    res.set('Cache-Control','private, no-store');
    res.set('X-Robots-Tag','noindex, nofollow');
    res.set('Referrer-Policy','no-referrer');
  }
  function statsJson(req,res){
    const state=gate(req);
    if(state!=='ok')return sendDenied(res,state,false);
    noStore(res);
    try{res.json(stats(req.query));}
    catch(e){res.status(e.status||500).json({error:e.status?e.message:'stats failed'});}
  }
  function statsPage(req,res){
    const state=gate(req);
    if(state!=='ok')return sendDenied(res,state,true);
    noStore(res);
    let data;
    try{data=stats(req.query);}
    catch(e){res.status(e.status||500).type('text/plain').send(e.status?e.message:'stats failed');return;}
    res.type('html').send(statsHtml(data,presentedToken(req)));
  }
  function collect(req,res){
    try{
      const b=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
      record({
        kind:b.t==='click'?'click':'page',
        path:b.path,ref:b.ref,utm_source:b.utm_source,utm_medium:b.utm_medium,utm_campaign:b.utm_campaign,
        bar:b.bar,link:b.link,ip:clientIp(req),
        ua:req.get?req.get('user-agent'):(req.headers&&req.headers['user-agent']),
        host:req.hostname||''
      });
    }catch(e){console.error('[analytics]',e.message);}
    res.status(204).set('Cache-Control','no-store').end();
  }
  return {record,collect,stats,statsJson,statsPage,barName,pageLabel};
}

function statsHtml(d,token){
  const max=Math.max(1,...d.viewsPerDay.map(x=>x.views));
  const rows=(list,cells)=>list.length?list.map(cells).join(''):'<tr><td colspan="4" class="empty">None in this range.</td></tr>';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Broadway Tonight stats</title>
<style>
  :root{color-scheme:light;font-family:Georgia, "Iowan Old Style", serif;color:#1c140c;background:#f6f1e8}
  body{margin:0;padding:20px 16px 48px}
  main{max-width:880px;margin:0 auto}
  h1{font-weight:500;font-size:28px;letter-spacing:-.02em;margin:0 0 4px}
  h2{font-size:18px;font-weight:600;margin:28px 0 8px}
  p,label,td,th{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .note{color:#5c5146;font-size:14px;line-height:1.45;margin:0 0 16px}
  form{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:12px 0 8px}
  label{font-size:13px;color:#5c5146;display:grid;gap:4px}
  input,button{font:inherit;font-size:16px;padding:8px 10px;border-radius:8px;border:1px solid #d9cfc2;background:#fff}
  button{background:#1c140c;color:#fff;border-color:#1c140c;cursor:pointer}
  .nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:16px 0}
  .num{background:#fff;border:1px solid #eadfce;border-radius:12px;padding:12px 14px}
  .num b{display:block;font-size:28px;font-family:Georgia,serif;font-weight:500}
  .num span{color:#5c5146;font-size:13px}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #f0e6d8;font-size:14px;vertical-align:top}
  th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5c5146;font-weight:600}
  .empty{color:#5c5146}
  .bar{height:8px;background:#c4552a;border-radius:99px;min-width:2px}
  .day{display:grid;grid-template-columns:108px 1fr 72px;gap:8px;align-items:center;margin:4px 0;font-size:13px}
  .day span:last-child{text-align:right;font-variant-numeric:tabular-nums}
  a{color:#8a3d18}
  .src{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #eadfce;font-size:14px}
</style></head><body><main>
<h1>Broadway Tonight</h1>
<p class="note">${esc(d.from)} – ${esc(d.to)} · ${esc(d.timezone)}. Page views from the public site. Owner and admin links are not counted. No cookies. IP addresses and full browser strings are not stored.</p>
<form method="get" action="/stats">
  <input type="hidden" name="token" value="${esc(token)}">
  <label>From <input type="date" name="from" value="${esc(d.from)}" required></label>
  <label>To <input type="date" name="to" value="${esc(d.to)}" required></label>
  <button type="submit">Update</button>
</form>
<p class="note"><a href="/api/stats?from=${esc(encodeURIComponent(d.from))}&amp;to=${esc(encodeURIComponent(d.to))}&amp;token=${esc(encodeURIComponent(token))}">JSON for this range</a></p>
<div class="nums">
  <div class="num"><b>${d.views.toLocaleString('en-US')}</b><span>Page views</span></div>
  <div class="num"><b>${d.visitors.toLocaleString('en-US')}</b><span>Unique visitors</span></div>
  <div class="num"><b>${d.devices.mobile.toLocaleString('en-US')}</b><span>Mobile views</span></div>
  <div class="num"><b>${d.devices.desktop.toLocaleString('en-US')}</b><span>Desktop views</span></div>
</div>
<p class="note">${esc(d.visitorsNote)}</p>
<h2>Views per day</h2>
${d.viewsPerDay.map(x=>`<div class="day"><span>${esc(x.day)}</span><span class="bar" style="width:${x.views?Math.max(4,Math.round(x.views/max*100)):0}%"></span><span>${x.views.toLocaleString('en-US')} · ${x.visitors.toLocaleString('en-US')} uniq</span></div>`).join('')}
<h2>Where visits came from</h2>
${SOURCES.map(k=>`<div class="src"><span>${esc(k)}</span><b>${(d.sources[k]||0).toLocaleString('en-US')}</b></div>`).join('')}
<p class="note">Instagram, TikTok, and Google are taken from the campaign tag (utm_source) when that names them, otherwise from the in-app browser or the referring site. Direct means no tag and no outside referrer. A campaign tag that names something else counts as other, and still shows in the campaign table.</p>
<h2>Top pages</h2>
<table><thead><tr><th>Page</th><th>Views</th><th>Visitors</th></tr></thead><tbody>
${rows(d.topPages,r=>`<tr><td>${esc(r.label)} <span class="empty">${esc(r.path)}</span></td><td>${r.views.toLocaleString('en-US')}</td><td>${r.visitors.toLocaleString('en-US')}</td></tr>`)}
</tbody></table>
<h2>Bar pages</h2>
<table><thead><tr><th>Bar</th><th>Views</th><th>Visitors</th></tr></thead><tbody>
${rows(d.topBarPages,r=>`<tr><td>${esc(r.name)} <span class="empty">${esc(r.path)}</span></td><td>${r.views.toLocaleString('en-US')}</td><td>${r.visitors.toLocaleString('en-US')}</td></tr>`)}
</tbody></table>
<h2>Referring sites</h2>
<table><thead><tr><th>Domain</th><th>Views</th></tr></thead><tbody>
${rows(d.referrers,r=>`<tr><td>${esc(r.referrer)}</td><td>${r.views.toLocaleString('en-US')}</td></tr>`)}
</tbody></table>
<h2>Campaigns</h2>
<table><thead><tr><th>Source</th><th>Medium</th><th>Campaign</th><th>Views</th></tr></thead><tbody>
${rows(d.utm,r=>`<tr><td>${esc(r.source)}</td><td>${esc(r.medium)}</td><td>${esc(r.campaign)}</td><td>${r.views.toLocaleString('en-US')}</td></tr>`)}
</tbody></table>
<h2>Outbound clicks</h2>
<table><thead><tr><th>Bar</th><th>Link</th><th>Clicks</th></tr></thead><tbody>
${rows(d.clicks,r=>`<tr><td>${esc(r.name||r.bar||'—')}</td><td>${esc(r.link)}</td><td>${r.clicks.toLocaleString('en-US')}</td></tr>`)}
</tbody></table>
</main></body></html>`;
}

function mount(app,db,opts){
  const database=db||require('./db');
  const a=createAnalytics(database,opts||{});
  const parse=express.json({
    limit:'4kb',
    strict:false,
    type:req=>/json|text\/plain|octet-stream/i.test(String(req.headers['content-type']||''))
  });
  app.post('/api/collect',(req,res)=>{
    const ct=String(req.headers['content-type']||'');
    if(/json/i.test(ct)&&req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body)&&!Array.isArray(req.body))return a.collect(req,res);
    parse(req,res,err=>{
      if(err)return res.status(204).end();
      if(typeof req.body==='string'){try{req.body=JSON.parse(req.body);}catch(e){req.body={};}}
      if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))req.body={};
      a.collect(req,res);
    });
  });
  app.get('/api/stats',(req,res)=>a.statsJson(req,res));
  app.get('/stats',(req,res)=>a.statsPage(req,res));
  return a;
}

module.exports={mount,createAnalytics,ensure,isBot,deviceOf,referrerDomain,sourceOf,normalizePath,cleanTag,dayKey,addDays,isDate};
