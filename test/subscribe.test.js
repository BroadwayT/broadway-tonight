const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const Database=require('better-sqlite3');
const A=require('../analytics');
const SUB=require('../subscribe');

const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';
const NOON=Date.parse('2026-11-13T18:00:00Z');

function mem(){return new Database(':memory:');}
function listen(app){
  return new Promise(resolve=>{
    const server=app.listen(0,'127.0.0.1',()=>resolve(server));
  });
}
function appWith(db,extra){
  const app=express();
  app.set('trust proxy',true);
  app.use(express.json());
  const analytics=A.mount(app,db,Object.assign({now:()=>NOON,token:'stats-secret'},extra||{}));
  SUB.mount(app,db,{analytics,now:()=>NOON});
  return app;
}
async function post(base,body,ip){
  const res=await fetch(base+'/api/subscribe',{
    method:'POST',
    headers:{'content-type':'application/json','user-agent':UA,'x-forwarded-for':ip||'203.0.113.10'},
    body:JSON.stringify(body||{})
  });
  const json=await res.json();
  return {status:res.status,body:json};
}

test('subscribe stores a trimmed lowercase email and rejects invalid ones',async()=>{
  const db=mem();
  const app=appWith(db);
  const server=await listen(app);
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const bad=await post(base,{email:'not-an-email',source:'/'},'203.0.113.11');
    assert.equal(bad.status,400);
    assert.equal(bad.body.ok,false);
    assert.equal(bad.body.message,SUB.MSG_BAD);
    const empty=await post(base,{email:'   '},'203.0.113.11');
    assert.equal(empty.status,400);
    const short=await post(base,{email:'a@b.c'},'203.0.113.11');
    assert.equal(short.status,400);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM subscribers').get().c,0);

    const ok=await post(base,{
      email:'  Fan@Example.COM ',
      source:'/bar/Tootsies/',
      utm_source:'ig',
      utm_medium:'social',
      utm_campaign:'nov-picks',
      hp_field:''
    },'203.0.113.11');
    assert.equal(ok.status,200);
    assert.equal(ok.body.ok,true);
    assert.equal(ok.body.duplicate,undefined);
    assert.equal(ok.body.message,SUB.MSG_OK);
    const row=db.prepare('SELECT * FROM subscribers').get();
    assert.equal(row.email,'fan@example.com');
    assert.equal(row.status,'active');
    assert.equal(row.source,'/bar/tootsies');
    assert.equal(row.utm_source,'ig');
    assert.equal(row.utm_medium,'social');
    assert.equal(row.utm_campaign,'nov-picks');
    assert.equal(row.created_at,NOON);
    assert.equal(/^[a-f0-9]{48}$/.test(row.unsubscribe_token),true);
    const blob=JSON.stringify(row);
    assert.equal(blob.includes('203.0.113.11'),false);
    assert.equal(blob.includes('iPhone'),false);
    const events=db.prepare('SELECT name,path FROM product_events').all();
    assert.deepEqual(events,[{name:'subscribe',path:'/bar/tootsies'}]);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM product_events').all()).includes('fan@example.com'),false);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});

test('duplicate signup is friendly and does not add a row',async()=>{
  const db=mem();
  const app=appWith(db);
  const server=await listen(app);
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const first=await post(base,{email:'fan@example.com',source:'/'},'203.0.113.12');
    assert.equal(first.body.message,SUB.MSG_OK);
    const again=await post(base,{email:'FAN@example.com',source:'/bar/roberts'},'203.0.113.12');
    assert.equal(again.status,200);
    assert.equal(again.body.ok,true);
    assert.equal(again.body.duplicate,true);
    assert.equal(again.body.message,SUB.MSG_DUP);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM subscribers').get().c,1);
    assert.equal(db.prepare("SELECT source FROM subscribers").get().source,'/');
    assert.equal(db.prepare("SELECT COUNT(*) c FROM product_events WHERE name='subscribe'").get().c,1);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});

test('honeypot looks successful and stores nothing',async()=>{
  const db=mem();
  const app=appWith(db);
  const server=await listen(app);
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const bot=await post(base,{email:'bot@example.com',hp_field:'https://spam.example',source:'/'},'203.0.113.13');
    assert.equal(bot.status,200);
    assert.equal(bot.body.ok,true);
    assert.equal(bot.body.message,SUB.MSG_OK);
    assert.equal(bot.body.duplicate,undefined);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM subscribers').get().c,0);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM product_events').get().c,0);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});

test('unsubscribe confirms, is idempotent, and signing up again restores active',async()=>{
  const db=mem();
  const app=appWith(db);
  const server=await listen(app);
  const base='http://127.0.0.1:'+server.address().port;
  try{
    await post(base,{email:'fan@example.com',source:'/'},'203.0.113.14');
    const token=db.prepare('SELECT unsubscribe_token FROM subscribers').get().unsubscribe_token;
    const page=await fetch(base+'/unsubscribe?token='+token);
    assert.equal(page.status,200);
    assert.equal(page.headers.get('x-robots-tag').includes('noindex'),true);
    const html=await page.text();
    assert.equal(html.includes('unsubscribed'),true);
    assert.equal(html.includes('weekend picks'),true);
    assert.equal(html.includes(token),false);
    assert.equal(html.includes('fan@example.com'),false);
    assert.equal(db.prepare('SELECT status FROM subscribers').get().status,'unsubscribed');
    assert.equal(db.prepare('SELECT unsubscribed_at FROM subscribers').get().unsubscribed_at,NOON);

    const again=await fetch(base+'/unsubscribe?token='+token);
    assert.equal((await again.text()).includes('unsubscribed'),true);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM subscribers WHERE status=?').get('unsubscribed').c,1);

    const missing=await fetch(base+'/unsubscribe');
    const bad=await fetch(base+'/unsubscribe?token=not-a-real-token');
    assert.equal((await missing.text()).includes('This link does not work.'),true);
    assert.equal((await bad.text()).includes('This link does not work.'),true);
    assert.equal(db.prepare('SELECT status FROM subscribers').get().status,'unsubscribed');

    const back=await post(base,{email:'fan@example.com',source:'/lineup'},'203.0.113.14');
    assert.equal(back.body.message,SUB.MSG_OK);
    assert.equal(back.body.duplicate,undefined);
    const row=db.prepare('SELECT status,source,unsubscribe_token FROM subscribers').get();
    assert.equal(row.status,'active');
    assert.equal(row.source,'/lineup');
    assert.equal(row.unsubscribe_token,token);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM subscribers').get().c,1);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});

test('csv and stats show active subscribers and share the analytics token',async()=>{
  const db=mem();
  const app=appWith(db);
  const server=await listen(app);
  const base='http://127.0.0.1:'+server.address().port;
  try{
    await post(base,{email:'fan@example.com',source:'/',utm_source:'newsletter'},'203.0.113.15');
    await post(base,{email:'gone@example.com',source:'/'},'203.0.113.16');
    const gone=db.prepare("SELECT unsubscribe_token FROM subscribers WHERE email='gone@example.com'").get().unsubscribe_token;
    await fetch(base+'/unsubscribe?token='+gone);

    const denied=await fetch(base+'/api/subscribers.csv');
    assert.equal(denied.status,401);
    const wrong=await fetch(base+'/api/subscribers.csv?token=nope');
    assert.equal(wrong.status,401);
    const csv=await fetch(base+'/api/subscribers.csv',{headers:{'x-analytics-token':'stats-secret'}});
    assert.equal(csv.status,200);
    assert.equal(csv.headers.get('content-type').includes('text/csv'),true);
    assert.equal(csv.headers.get('content-disposition').includes('subscribers.csv'),true);
    const text=await csv.text();
    assert.equal(text.startsWith('email,created_at,source,utm_source,utm_medium,utm_campaign\n'),true);
    assert.equal(text.includes('fan@example.com'),true);
    assert.equal(text.includes('newsletter'),true);
    assert.equal(text.includes('gone@example.com'),false);
    assert.equal(text.includes('unsubscribe'),false);
    const query=await fetch(base+'/api/subscribers.csv?token=stats-secret');
    assert.equal((await query.text()).includes('fan@example.com'),true);

    const stats=await fetch(base+'/api/stats',{headers:{'x-analytics-token':'stats-secret'}});
    const body=await stats.json();
    assert.equal(body.subscribers.active,1);
    assert.equal(body.subscribers.unsubscribed,1);
    assert.equal(body.subscribeEvents,2);
    const page=await fetch(base+'/stats?token=stats-secret');
    const html=await page.text();
    assert.equal(html.includes('Active subscribers'),true);
    assert.equal(html.includes('/api/subscribers.csv?token='),true);
    assert.equal(html.includes('>1</b><span>Active subscribers</span>'),true);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});

test('csv stays hidden until ANALYTICS_TOKEN is set',async()=>{
  const db=mem();
  const app=express();
  app.use(express.json());
  const analytics=A.mount(app,db,{now:()=>NOON,token:''});
  SUB.mount(app,db,{analytics,now:()=>NOON});
  const server=await listen(app);
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const csv=await fetch(base+'/api/subscribers.csv?token=anything');
    const header=await fetch(base+'/api/subscribers.csv',{headers:{'x-analytics-token':'anything'}});
    assert.equal(csv.status,404);
    assert.equal(header.status,404);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});

test('subscribe rate limit is 5 an hour per IP',async()=>{
  const db=mem();
  const app=appWith(db);
  const server=await listen(app);
  const base='http://127.0.0.1:'+server.address().port;
  try{
    for(let i=0;i<5;i++){
      const r=await post(base,{email:`fan${i}@example.com`},'198.51.100.8');
      assert.equal(r.status,200);
      assert.equal(r.body.ok,true);
    }
    const blocked=await post(base,{email:'fan6@example.com'},'198.51.100.8');
    assert.equal(blocked.status,429);
    assert.equal(blocked.body.message,SUB.MSG_RATE);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM subscribers').get().c,5);
    const other=await post(base,{email:'other@example.com'},'198.51.100.9');
    assert.equal(other.status,200);
    assert.equal(db.prepare("SELECT email FROM subscribers WHERE email='other@example.com'").get().email,'other@example.com');
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});
