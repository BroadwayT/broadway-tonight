// Weekend-picks list. Emails live in the same SQLite file as the rest of the app.
// No confirmation mail (no sender is connected). Raw IP addresses are not stored.
const crypto=require('crypto');
const A=require('./analytics');

const MSG_OK="You're in. Watch for the picks Thursday.";
const MSG_DUP="You're already on the list. Watch for the picks Thursday.";
const MSG_BAD='Enter a valid email.';
const MSG_RATE='Too many tries from this connection. Try again later.';
const MSG_ERR='Something went wrong. Try again.';
const HOUR=60*60*1000;

function ensure(db){
  db.exec(`CREATE TABLE IF NOT EXISTS subscribers(
    email TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    source TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','unsubscribed')),
    unsubscribe_token TEXT NOT NULL UNIQUE,
    unsubscribed_at INTEGER
  );`);
}

function normalizeEmail(raw){
  return String(raw==null?'':raw).trim().toLowerCase();
}
function validEmail(email){
  if(!email||email.length>254||email.includes('..'))return false;
  if(!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(email))return false;
  const at=email.indexOf('@');
  const local=email.slice(0,at),domain=email.slice(at+1);
  if(!local||!domain||local.length>64||domain.length>253)return false;
  if(local.startsWith('.')||local.endsWith('.')||domain.startsWith('.')||domain.endsWith('.')||domain.startsWith('-')||domain.endsWith('-'))return false;
  return true;
}
function honeypot(body){
  if(!body||!Object.prototype.hasOwnProperty.call(body,'hp_field'))return false;
  const v=body.hp_field;
  if(v==null)return false;
  if(typeof v==='string')return v.trim()!=='';
  return true;
}
function cleanSource(raw){
  return A.normalizePath(raw);
}
function csvCell(v){
  const s=v==null?'':String(v);
  if(/[",\n\r]/.test(s))return '"'+s.replace(/"/g,'""')+'"';
  return s;
}
function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function createSubscribe(db,opts){
  opts=opts||{};
  ensure(db);
  const nowFn=opts.now||Date.now;
  const limit=opts.limit==null?5:opts.limit;
  const windowMs=opts.windowMs||HOUR;
  const buckets=new Map();
  const insert=db.prepare(`INSERT INTO subscribers(email,created_at,source,utm_source,utm_medium,utm_campaign,status,unsubscribe_token)
    VALUES(?,?,?,?,?,?,'active',?)`);
  const byEmail=db.prepare('SELECT email,status,unsubscribe_token FROM subscribers WHERE email=?');
  const reactivate=db.prepare(`UPDATE subscribers SET status='active', unsubscribed_at=NULL, source=?, utm_source=?, utm_medium=?, utm_campaign=? WHERE email=?`);
  const byToken=db.prepare('SELECT email,status FROM subscribers WHERE unsubscribe_token=?');
  const markOff=db.prepare("UPDATE subscribers SET status='unsubscribed', unsubscribed_at=? WHERE unsubscribe_token=? AND status!='unsubscribed'");
  const activeRows=db.prepare(`SELECT email,created_at,source,utm_source,utm_medium,utm_campaign FROM subscribers WHERE status='active' ORDER BY created_at, email`);

  function limited(ip){
    const key=crypto.createHash('sha256').update(String(ip||'')).digest('hex').slice(0,16);
    const t=nowFn();
    let arr=(buckets.get(key)||[]).filter(x=>t-x<windowMs);
    if(arr.length>=limit){buckets.set(key,arr);return true;}
    arr.push(t);
    buckets.set(key,arr);
    if(buckets.size>4000){
      for(const [k,v] of buckets){if(!v.length||t-v[v.length-1]>windowMs)buckets.delete(k);}
    }
    return false;
  }
  function meta(body){
    return {
      source:cleanSource(body.source),
      utm_source:A.cleanTag(body.utm_source),
      utm_medium:A.cleanTag(body.utm_medium),
      utm_campaign:A.cleanTag(body.utm_campaign)
    };
  }
  function note(req,source){
    const analytics=opts.analytics;
    if(!analytics||typeof analytics.record!=='function')return;
    try{
      analytics.record({
        kind:'subscribe',
        path:source||'/',
        ip:req.ip||'',
        ua:req.get?req.get('user-agent'):(req.headers&&req.headers['user-agent'])
      });
    }catch(e){console.error('[subscribe]',e.message);}
  }
  function post(req,res){
    const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
    if(limited(req.ip||''))return res.status(429).json({ok:false,message:MSG_RATE});
    if(honeypot(body))return res.json({ok:true,message:MSG_OK});
    const email=normalizeEmail(body.email);
    if(!validEmail(email))return res.status(400).json({ok:false,message:MSG_BAD});
    const m=meta(body);
    const existing=byEmail.get(email);
    if(existing&&existing.status==='active')return res.json({ok:true,duplicate:true,message:MSG_DUP});
    if(existing){
      reactivate.run(m.source,m.utm_source,m.utm_medium,m.utm_campaign,email);
      note(req,m.source);
      return res.json({ok:true,message:MSG_OK});
    }
    try{
      insert.run(email,nowFn(),m.source,m.utm_source,m.utm_medium,m.utm_campaign,crypto.randomBytes(24).toString('hex'));
    }catch(e){
      if(String(e).includes('UNIQUE'))return res.json({ok:true,duplicate:true,message:MSG_DUP});
      console.error('[subscribe]',e.message);
      return res.status(500).json({ok:false,message:MSG_ERR});
    }
    note(req,m.source);
    res.json({ok:true,message:MSG_OK});
  }
  function unsubscribe(req,res){
    const token=Array.isArray(req.query&&req.query.token)?'':String(req.query&&req.query.token||'');
    res.set('Cache-Control','private, no-store');
    res.set('X-Robots-Tag','noindex, nofollow');
    res.set('Referrer-Policy','no-referrer');
    let ok=false;
    if(/^[a-f0-9]{32,64}$/.test(token)){
      const row=byToken.get(token);
      if(row){
        ok=true;
        if(row.status!=='unsubscribed')markOff.run(nowFn(),token);
      }
    }
    res.type('html').send(unsubscribeHtml(ok));
  }
  function csv(req,res){
    const analytics=opts.analytics;
    const state=analytics&&typeof analytics.gate==='function'?analytics.gate(req):'disabled';
    res.set('Cache-Control','private, no-store');
    res.set('X-Robots-Tag','noindex, nofollow');
    res.set('Referrer-Policy','no-referrer');
    if(state!=='ok'){
      res.status(state==='disabled'?404:401);
      return res.json({error:state==='disabled'?'not found':'unauthorized'});
    }
    const lines=['email,created_at,source,utm_source,utm_medium,utm_campaign'];
    for(const r of activeRows.all()){
      const created=Number.isFinite(r.created_at)?new Date(r.created_at).toISOString():'';
      lines.push([r.email,created,r.source,r.utm_source,r.utm_medium,r.utm_campaign].map(csvCell).join(','));
    }
    res.set('Content-Disposition','attachment; filename="subscribers.csv"');
    res.type('text/csv; charset=utf-8').send(lines.join('\n')+'\n');
  }
  return {post,unsubscribe,csv};
}

function unsubscribeHtml(ok){
  const title=ok?"You're unsubscribed.":'This link does not work.';
  const detail=ok
    ?"You won't get the weekend picks."
    :'The unsubscribe link is missing or no longer matches.';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} Broadway Tonight</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100dvh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    color:#f7f2ea;background:
      radial-gradient(700px 380px at 10% -10%, rgba(255,45,149,.28), transparent 55%),
      radial-gradient(520px 320px at 100% 0%, rgba(255,214,10,.14), transparent 50%),
      #07060a}
  main{max-width:420px;margin:0 auto;padding:48px 20px}
  .kicker{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#ff2d95;font-weight:700;margin:0 0 12px}
  h1{font-size:32px;line-height:1.05;margin:0 0 12px;letter-spacing:-.02em}
  p{font-size:16px;line-height:1.45;color:#c9c0d4;margin:0 0 18px}
  a{color:#ffd60a;font-weight:700;text-decoration:none}
</style></head><body><main>
<p class="kicker">Broadway Tonight</p>
<h1>${esc(title)}</h1>
<p>${esc(detail)}</p>
<p><a href="/">Back to tonight</a></p>
</main></body></html>`;
}

function mount(app,db,opts){
  const database=db||require('./db');
  const api=createSubscribe(database,opts||{});
  app.post('/api/subscribe',(req,res)=>api.post(req,res));
  app.get('/unsubscribe',(req,res)=>api.unsubscribe(req,res));
  app.get('/api/subscribers.csv',(req,res)=>api.csv(req,res));
  return api;
}

module.exports={ensure,mount,createSubscribe,normalizeEmail,validEmail,MSG_OK,MSG_DUP,MSG_BAD,MSG_RATE};
