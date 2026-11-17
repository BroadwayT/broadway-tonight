const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');

process.env.DB_PATH=path.join(os.tmpdir(),'bt-lineup-dedupe-'+process.pid+'.db');

const db=require('../db');
const BARS=require('../bars');
const L=require('../lineup');

BARS.upsertBars(db);

const DATE='2026-11-17';
const names=(rows)=>rows.map(r=>({id:r.id,band:r.band_id,start:r.set_start,end:r.set_end,stage:r.stage,source:r.source,note:r.note}));

function named(bar){
 return db.prepare("SELECT s.id,s.band_id,s.set_start,s.set_end,s.stage,s.source,s.note,b.name AS band FROM sets s JOIN bands b ON b.id=s.band_id WHERE s.bar_id=? AND s.date=? AND s.band_id<>'tba' ORDER BY s.set_start,s.id").all(bar,DATE);
}

test('preferManual keeps the bar-own source over nashvillelineup',()=>{
 const line={date:DATE,bar:'nudies',band:'Jabe Burgess',start:'10:00',end:'14:00',stage:'1st Floor',source:'https://nashvillelineup.com/broadway (fetched 2026-11-16 ~10:20 PM PT)'};
 const own={date:DATE,bar:'nudies',band:'Jabe Burgess',start:'10:00',end:'14:30',source:"https://www.nudieshonkytonk.com homepage This Week's Band Schedule"};
 assert.equal(L.isAggregatorSource(line.source),true);
 assert.equal(L.isBarOwnSource(own),true);
 assert.equal(L.preferManual(line,own),own);
 assert.deepEqual(L.dedupeManual([line,own]),[own]);
 assert.deepEqual(L.dedupeManual([own,line]),[own]);
});

test('manual-sets.json no longer has a Nashville Lineup Jabe Burgess on Nov 17',()=>{
 const J=require('../manual-sets.json');
 const jabe=(J.sets||[]).filter(s=>s.date===DATE&&s.bar==='nudies'&&/jabe burgess/i.test(s.band));
 assert.equal(jabe.length,1);
 assert.equal(jabe[0].end,'14:30');
 assert.match(jabe[0].source,/nudieshonkytonk\.com/);
 assert.ok(!/nashvillelineup/i.test(jabe[0].source));
});

test('applyManual on a live-like DB keeps one official Chief\'s 5th-floor set and one Nudie\'s Jabe Burgess',()=>{
 db.prepare("INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)").run('nmc_lauren-rose','Lauren Rose');
 db.prepare("INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)").run('nmc_amelia-white','Amelia White');
 db.prepare("INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)").run('nmc_kiely-connell','Kiely Connell');
 db.prepare("INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)").run('nmc_timbo','Timbo');
 db.prepare("INSERT OR IGNORE INTO bands(id,name) VALUES(?,?)").run('nmc_jabe-burgess','Jabe Burgess');
 L.ensureDay(DATE);
 const ins=db.prepare("INSERT OR REPLACE INTO sets(id,bar_id,band_id,date,set_start,set_end,set_window_id,source,source_url,stage,note) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
 const stale=[
  ['2026-11-17-chiefs-st-5th-floor-1130-nmc_lauren-rose','chiefs','nmc_lauren-rose','11:30','14:30','2026-11-17-slot0','5th Floor'],
  ['2026-11-17-chiefs-st-5th-floor-1430-nmc_amelia-white','chiefs','nmc_amelia-white','14:30','17:30','2026-11-17-slot1','5th Floor'],
  ['2026-11-17-chiefs-st-5th-floor-1730-nmc_kiely-connell','chiefs','nmc_kiely-connell','17:30','20:30','2026-11-17-slot2','5th Floor'],
  ['2026-11-17-chiefs-st-5th-floor-2030-nmc_timbo','chiefs','nmc_timbo','20:30','23:00','2026-11-17-slot2','5th Floor'],
  ['2026-11-17-nudies-0','nudies','nmc_jabe-burgess','10:00','14:00','2026-11-17-slot0','1st Floor'],
  ['2026-11-17-nudies-st-1st-floor-1000-nmc_jabe-burgess','nudies','nmc_jabe-burgess','10:00','14:00','2026-11-17-slot0','1st Floor']
 ];
 for(const [id,bar,bid,st,en,win,stage] of stale)ins.run(id,bar,bid,DATE,st,en,win,'manual',null,stage,null);

 L.applyManual(DATE);
 L.applyManual(DATE); // idempotent

 const chiefs=named('chiefs');
 const fifth=chiefs.filter(r=>/Lauren Rose|Amelia White|Kiely Connell|^Timbo$/.test(r.band));
 assert.equal(fifth.length,4,JSON.stringify(names(fifth),null,2));
 for(const r of fifth){
  assert.equal(r.stage,'Redemption Bar – 5th Floor',r.id);
  assert.equal(r.note,'Subject to change',r.id);
  assert.ok(!/-st-5th-floor-/.test(r.id),r.id);
 }
 const byName=Object.fromEntries(fifth.map(r=>[r.band,r]));
 assert.equal(byName['Lauren Rose'].set_start,'11:30');
 assert.equal(byName['Amelia White'].set_start,'14:30');
 assert.equal(byName['Kiely Connell'].set_start,'17:30');
 assert.equal(byName['Timbo'].set_start,'20:30');
 // 1st-floor house artists still present once
 for(const name of ['Shelby Lee Lowe','Jenifer Wrinkle','Timothy James','Cian Pedersen'])
  assert.equal(chiefs.filter(r=>r.band===name).length,1,name);

 const jabe=named('nudies').filter(r=>r.band==='Jabe Burgess');
 assert.equal(jabe.length,1,JSON.stringify(names(jabe),null,2));
 assert.equal(jabe[0].set_start,'10:00');
 assert.equal(jabe[0].set_end,'14:30');
 assert.equal(jabe[0].stage,null);
 assert.equal(jabe[0].id,'2026-11-17-nudies-0');
 assert.equal(named('nudies').filter(r=>r.band==='Mike Riley').length,1);
});

test.after(()=>{
 try{fs.unlinkSync(process.env.DB_PATH);}catch(e){}
 try{fs.unlinkSync(process.env.DB_PATH+'-wal');}catch(e){}
 try{fs.unlinkSync(process.env.DB_PATH+'-shm');}catch(e){}
});
