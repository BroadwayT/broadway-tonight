const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const Database=require('better-sqlite3');
const A=require('../analytics');

const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 TestBrowser/UniqueMarker';
const MOBILE='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';
const NOON=Date.parse('2026-11-13T18:00:00Z'); // 12:00 CT

function mem(){return new Database(':memory:');}
function analytics(db,extra){
  return A.createAnalytics(db,Object.assign({now:()=>NOON,token:'stats-secret'},extra||{}));
}

test('day boundary follows America/Chicago',()=>{
  assert.equal(A.dayKey(Date.parse('2026-11-13T05:30:00Z')),'2026-11-12');
  assert.equal(A.dayKey(Date.parse('2026-11-13T06:30:00Z')),'2026-11-13');
  assert.equal(A.addDays('2026-11-13',-6),'2026-11-07');
});

test('paths, referrers, devices, and sources stay coarse',()=>{
  assert.equal(A.normalizePath('/'),'/');
  assert.equal(A.normalizePath('/lineup'),'/lineup');
  assert.equal(A.normalizePath('/bar/Tootsies/'),'/bar/tootsies');
  assert.equal(A.normalizePath('/band/mac-watts'),'/band/mac-watts');
  assert.equal(A.normalizePath('/owner/secret-token'),null);
  assert.equal(A.normalizePath('/api/admin/review'),null);
  assert.equal(A.normalizePath('/stats'),null);
  assert.equal(A.normalizePath('/bar/../owner/x'),null);
  assert.equal(A.referrerDomain('https://www.instagram.com/p/abc?utm=1'),'instagram.com');
  assert.equal(A.referrerDomain('https://l.instagram.com/reel/xyz'),'l.instagram.com');
  assert.equal(A.referrerDomain('https://broadwaytonightnash.com/bar/tootsies'),null);
  assert.equal(A.referrerDomain('https://news.google.com/search'),'news.google.com');
  assert.equal(A.deviceOf(MOBILE),'mobile');
  assert.equal(A.deviceOf(UA),'desktop');
  assert.equal(A.isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'),true);
  assert.equal(A.isBot(UA),false);
  assert.equal(A.sourceOf('instagram.com',null,UA),'instagram');
  assert.equal(A.sourceOf('vm.tiktok.com',null,UA),'tiktok');
  assert.equal(A.sourceOf('google.com',null,UA),'google');
  assert.equal(A.sourceOf(null,'ig',UA),'instagram');
  assert.equal(A.sourceOf('google.com','tiktok',UA),'tiktok');
  assert.equal(A.sourceOf(null,null,'Mozilla/5.0 Instagram 300.0.0'),'instagram');
  assert.equal(A.sourceOf(null,null,UA),'direct');
  assert.equal(A.sourceOf('facebook.com',null,UA),'other');
  assert.equal(A.sourceOf(null,'newsletter',UA),'other');
});

test('page views store no ip, user agent, or full referrer',()=>{
  const db=mem();
  const a=analytics(db);
  const ip='203.0.113.44';
  const ref='https://l.instagram.com/p/secret-path?x=1';
  const first=a.record({kind:'page',path:'/?utm_source=ig',ref,utm_source:'ig',utm_medium:'social',utm_campaign:'nov-bars',ip,ua:MOBILE,host:'broadwaytonightnash.com'});
  assert.equal(first.stored,true);
  assert.equal(first.path,'/');
  assert.equal(first.source,'instagram');
  assert.equal(first.device,'mobile');
  const again=a.record({kind:'page',path:'/bar/tootsies',ref,utm_source:'ig',utm_medium:'social',utm_campaign:'nov-bars',ip,ua:MOBILE});
  assert.equal(again.stored,true);
  const other=a.record({kind:'page',path:'/lineup',ip,ua:UA});
  assert.equal(other.source,'direct');
  assert.equal(other.device,'desktop');
  assert.equal(a.record({kind:'page',path:'/owner/abcdef',ip,ua:UA}).reason,'path');
  assert.equal(a.record({kind:'page',path:'/',ip,ua:'Mozilla/5.0 Googlebot/2.1'}).reason,'bot');

  const rows=db.prepare('SELECT * FROM pageviews ORDER BY id').all();
  assert.equal(rows.length,3);
  assert.equal(rows[0].visitor,rows[1].visitor);
  assert.notEqual(rows[0].visitor,rows[2].visitor);
  assert.equal(rows[0].referrer,'l.instagram.com');
  assert.equal(rows[0].utm_source,'ig');
  assert.equal(rows[0].utm_medium,'social');
  assert.equal(rows[0].utm_campaign,'nov-bars');
  const blob=JSON.stringify(rows);
  assert.equal(blob.includes(ip),false);
  assert.equal(blob.includes('UniqueMarker'),false);
  assert.equal(blob.includes('iPhone'),false);
  assert.equal(blob.includes('secret-path'),false);
  assert.equal(blob.includes(ref),false);
  const salt=db.prepare('SELECT salt FROM analytics_salt').get().salt;
  assert.equal(blob.includes(salt),false);
  assert.equal(salt.length>=32,true);
});

test('visitor salt rotates each day and only the current salt is kept',()=>{
  const db=mem();
  let t=Date.parse('2026-11-13T18:00:00Z');
  const a=A.createAnalytics(db,{now:()=>t,token:'x'});
  a.record({kind:'page',path:'/',ip:'198.51.100.8',ua:UA});
  const first=db.prepare('SELECT visitor,day FROM pageviews').get();
  const salt1=db.prepare('SELECT salt,day FROM analytics_salt').get();
  t=Date.parse('2026-11-14T18:00:00Z');
  a.record({kind:'page',path:'/',ip:'198.51.100.8',ua:UA});
  const rows=db.prepare('SELECT visitor,day FROM pageviews ORDER BY id').all();
  const salts=db.prepare('SELECT day,salt FROM analytics_salt').all();
  assert.equal(rows[0].day,'2026-11-13');
  assert.equal(rows[1].day,'2026-11-14');
  assert.notEqual(rows[0].visitor,rows[1].visitor);
  assert.equal(salts.length,1);
  assert.equal(salts[0].day,'2026-11-14');
  assert.notEqual(salts[0].salt,salt1.salt);
  assert.equal(first.visitor,rows[0].visitor);
});

test('stats summarize views, bars, sources, campaigns, and clicks',()=>{
  const db=mem();
  db.exec("CREATE TABLE bars(id TEXT PRIMARY KEY, name TEXT)");
  db.prepare('INSERT INTO bars(id,name) VALUES(?,?)').run('tootsies',"Tootsie's Orchid Lounge");
  const a=analytics(db);
  const ip='203.0.113.9';
  a.record({kind:'page',path:'/',ref:'https://www.google.com/search?q=broadway',ip,ua:UA});
  a.record({kind:'page',path:'/bar/tootsies',ref:'https://www.google.com/search?q=broadway',utm_source:'ig',utm_medium:'social',utm_campaign:'sponsor',ip,ua:MOBILE});
  a.record({kind:'page',path:'/bar/tootsies',ip:'203.0.113.10',ua:UA});
  a.record({kind:'page',path:'/lineup',ip,ua:UA});
  a.record({kind:'click',bar:'tootsies',link:'website',ip,ua:MOBILE});
  a.record({kind:'click',bar:'tootsies',link:'instagram',ip,ua:MOBILE});
  a.record({kind:'click',bar:'tootsies',link:'tip',ip,ua:UA});
  a.record({kind:'click',bar:'nope/../x',link:'tickets',ip,ua:UA});
  const s=a.stats({});
  assert.equal(s.from,'2026-11-07');
  assert.equal(s.to,'2026-11-13');
  assert.equal(s.timezone,'America/Chicago');
  assert.equal(s.views,4);
  assert.equal(s.visitors,3);
  assert.equal(s.viewsPerDay.length,7);
  assert.equal(s.viewsPerDay[6].day,'2026-11-13');
  assert.equal(s.viewsPerDay[6].views,4);
  assert.equal(s.viewsPerDay[0].views,0);
  assert.equal(s.topBarPages[0].bar,'tootsies');
  assert.equal(s.topBarPages[0].name,"Tootsie's Orchid Lounge");
  assert.equal(s.topBarPages[0].views,2);
  assert.equal(s.topBarPages[0].visitors,2);
  assert.equal(s.sources.instagram,1);
  assert.equal(s.sources.google,1);
  assert.equal(s.sources.direct,2);
  assert.equal(s.referrers[0].referrer,'google.com');
  assert.equal(s.utm[0].source,'ig');
  assert.equal(s.utm[0].medium,'social');
  assert.equal(s.utm[0].campaign,'sponsor');
  assert.equal(s.devices.mobile,1);
  assert.equal(s.devices.desktop,3);
  const clickLinks=s.clicks.map(c=>c.link).sort();
  assert.deepEqual(clickLinks,['instagram','tip','website']);
  assert.equal(s.clicks.every(c=>c.bar==='tootsies'&&c.name==="Tootsie's Orchid Lounge"),true);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM outbound_clicks').get().c,3);
  assert.throws(()=>a.stats({from:'2026-13-01',to:'2026-13-02'}),e=>e.status===400);
  assert.throws(()=>a.stats({from:'2026-11-10',to:'2026-11-01'}),e=>e.status===400);
});

function listen(app){
  return new Promise(resolve=>{
    const server=app.listen(0,'127.0.0.1',()=>resolve(server));
  });
}

test('http beacon and private stats',async()=>{
  const db=mem();
  db.exec('CREATE TABLE bars(id TEXT PRIMARY KEY, name TEXT)');
  db.prepare('INSERT INTO bars(id,name) VALUES(?,?)').run('bootbarn','The Stage on Broadway');
  const app=express();
  app.use(express.json());
  A.mount(app,db,{now:()=>NOON,token:'stats-secret'});
  const server=await listen(app);
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const page=await fetch(base+'/api/collect',{
      method:'POST',
      headers:{'content-type':'application/json','user-agent':MOBILE,'x-forwarded-for':'203.0.113.20'},
      body:JSON.stringify({t:'page',path:'/bar/bootbarn',ref:'https://www.tiktok.com/@someone/video/1',utm_source:'tiktok',utm_medium:'social',utm_campaign:'tonight'})
    });
    assert.equal(page.status,204);
    const plain=await fetch(base+'/api/collect',{
      method:'POST',
      headers:{'content-type':'text/plain;charset=UTF-8','user-agent':UA,'x-forwarded-for':'203.0.113.21'},
      body:JSON.stringify({t:'click',bar:'bootbarn',link:'tip'})
    });
    assert.equal(plain.status,204);
    const bot=await fetch(base+'/api/collect',{
      method:'POST',
      headers:{'content-type':'application/json','user-agent':'Mozilla/5.0 (compatible; Googlebot/2.1)'},
      body:JSON.stringify({t:'page',path:'/'})
    });
    assert.equal(bot.status,204);
    const owner=await fetch(base+'/api/collect',{
      method:'POST',
      headers:{'content-type':'application/json','user-agent':UA},
      body:JSON.stringify({t:'page',path:'/owner/magic-link-token'})
    });
    assert.equal(owner.status,204);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM pageviews').get().c,1);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM outbound_clicks').get().c,1);
    const row=db.prepare('SELECT path,referrer,source,utm_source,device FROM pageviews').get();
    assert.deepEqual(row,{path:'/bar/bootbarn',referrer:'tiktok.com',source:'tiktok',utm_source:'tiktok',device:'mobile'});
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM pageviews').all()).includes('203.0.113.20'),false);

    const denied=await fetch(base+'/api/stats');
    assert.equal(denied.status,401);
    const json=await fetch(base+'/api/stats?from=2026-11-13&to=2026-11-13',{headers:{'x-analytics-token':'stats-secret'}});
    assert.equal(json.status,200);
    const body=await json.json();
    assert.equal(body.views,1);
    assert.equal(body.visitors,1);
    assert.equal(body.topBarPages[0].name,'The Stage on Broadway');
    assert.equal(body.clicks[0].link,'tip');
    assert.equal(body.sources.tiktok,1);
    const html=await fetch(base+'/stats?token=stats-secret&from=2026-11-13&to=2026-11-13');
    assert.equal(html.status,200);
    const text=await html.text();
    assert.equal(text.includes('The Stage on Broadway'),true);
    assert.equal(text.includes('noindex'),true);
    assert.equal(html.headers.get('x-robots-tag').includes('noindex'),true);
    assert.equal(html.headers.get('cache-control').includes('no-store'),true);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});

test('stats stay disabled until ANALYTICS_TOKEN is set',async()=>{
  const db=mem();
  const app=express();
  A.mount(app,db,{now:()=>NOON,token:''});
  const server=await listen(app);
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const page=await fetch(base+'/stats?token=anything');
    const api=await fetch(base+'/api/stats',{headers:{'x-analytics-token':'anything'}});
    assert.equal(page.status,404);
    assert.equal(api.status,404);
    const beacon=await fetch(base+'/api/collect',{method:'POST',headers:{'content-type':'application/json','user-agent':UA},body:JSON.stringify({t:'page',path:'/'})});
    assert.equal(beacon.status,204);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM pageviews').get().c,1);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});
