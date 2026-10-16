// Implements /workspace/broadway-hotscore-mvp-spec.md exactly.
const db=require('./db');
const PRIOR=3.5,C=20,H=3600e3;
const ctDay=(t=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago'}).format(new Date(t));
// CT "night" = calendar day shifted by 3h (snapshot at 3 AM CT)
const ctNight=(t=Date.now())=>ctDay(t-3*H);
function score(windowH,halfLife,now=Date.now()){
  const bars=db.prepare('SELECT * FROM bars').all();
  const rows=db.prepare('SELECT bar_id,rating,created_at,check_in,device_id FROM ratings WHERE hidden=0 AND created_at>=? AND created_at<=?').all(now-windowH*H,now);
  return bars.map(b=>{
    const r=rows.filter(x=>x.bar_id===b.id);let sw=0,swr=0;
    for(const x of r){const w=Math.pow(0.5,((now-x.created_at)/H)/halfLife);sw+=w;swr+=w*x.rating;}
    const base=(C*PRIOR+swr)/(C+sw);
    const ci=new Set(r.filter(x=>x.check_in).map(x=>x.device_id)).size;
    const boost=Math.min(0.5,0.1*Math.log(1+ci));
    return {barId:b.id,name:b.name,n:r.length,weightedN:+sw.toFixed(2),base:+base.toFixed(3),checkins:ci,boost:+boost.toFixed(3),score:+(base+boost).toFixed(3)};
  });
}
function tonight(now){return score(6,3,now).map(s=>({...s,visible:s.n>=5})).sort((a,b)=>(b.visible-a.visible)||b.score-a.score);}
function week(now){return score(7*24,24,now).sort((a,b)=>b.score-a.score);}
function snapshotTonight(now=Date.now()){ // run at 3 AM CT (and on demand); records top5 for the night
  const day=ctNight(now),top=tonight(now).filter(s=>s.visible).slice(0,5);
  const ins=db.prepare('INSERT OR IGNORE INTO daily_top5(day,bar_id) VALUES(?,?)');top.forEach(t=>ins.run(day,t.barId));return {day,top:top.map(t=>t.barId)};
}
function streaks(now=Date.now()){
  const w=Object.fromEntries(week(now).map(s=>[s.barId,s.score]));
  const live=new Set(tonight(now).filter(s=>s.visible).slice(0,5).map(s=>s.barId));
  return db.prepare('SELECT * FROM bars').all().map(b=>{
    let st=0;
    // walk back from last completed night; one miss resets (stops)
    for(let d=1;d<400;d++){const day=ctNight(now-d*24*H);if(db.prepare('SELECT 1 FROM daily_top5 WHERE day=? AND bar_id=?').get(day,b.id))st++;else break;}
    return {barId:b.id,name:b.name,streak:st,inTop5Tonight:live.has(b.id),weekScore:+(w[b.id]||PRIOR).toFixed(3)};
  }).sort((a,b)=>b.streak-a.streak||b.weekScore-a.weekScore);
}
module.exports={tonight,week,streaks,snapshotTonight,ctDay,ctNight,PRIOR,C,H};
