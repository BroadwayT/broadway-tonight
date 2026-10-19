// Lineup sources: each bar's OWN public schedule page (preferred), Nashville Music Calendar as fallback.
// robots.txt checked per host; identified UA; no challenge/captcha bypass (a challenge page = "blocked").
const UA='BroadwayTonight/0.3 (+https://broadwaytonightnash.com; lineup listings, low rate)';
const MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
const SOURCES={
 acme:[{type:'sqsphtml',url:'https://www.acmefeedandseed.com/calendar'}],
 redneckriviera:[{type:'redneck',url:'https://redneckrivieranashville.com/events/'}],
 olered:[{type:'olered',url:'https://olered.com/nashville/calendar/'}],
 luke32:[{type:'lukes',url:'https://lukes32bridge.com/live-music/'},{type:'nmc',url:'https://nashvillemusiccalendar.com/venue/lukes-32-bridge-food-drink/'}],
 casarosa:[{type:'casarosa',url:'https://casarosanashville.com/music/'}],
 bellbottomsup:[{type:'bellb',url:'https://bellbottomsupbar.com/music/'}],
 margaritaville:[{type:'jsonld',url:'https://www.margaritavillenashville.com/calendar'}],
 roberts:[{type:'nmc',url:'https://nashvillemusiccalendar.com/venue/roberts-western-world/'}],
 legends:[{type:'nmc',url:'https://nashvillemusiccalendar.com/venue/legends-corner/'}],
 bootbarn:[{type:'nmc',url:'https://nashvillemusiccalendar.com/venue/the-stage-on-broadway/'}],
 aldeans:[{type:'nmc',url:'https://nashvillemusiccalendar.com/venue/jason-aldeans-kitchen-rooftop-bar/'}],
};
const robotsCache={};
async function robotsOk(u){const p=new URL(u),k=p.origin;let rules=robotsCache[k];
 if(!rules||Date.now()-rules.t>6*3600e3){let txt='';try{const r=await fetch(k+'/robots.txt',{headers:{'User-Agent':UA}});if(r.ok)txt=await r.text();}catch(e){}
  const dis=[];let on=false;for(const raw of txt.split(/\r?\n/)){const l=raw.replace(/#.*/,'').trim();const m=l.match(/^([a-z-]+)\s*:\s*(.*)$/i);if(!m)continue;const f=m[1].toLowerCase(),v=m[2].trim();
   if(f==='user-agent')on=(v==='*'||/broadwaytonight/i.test(v));else if(on&&f==='disallow'&&v)dis.push(v);}
  rules=robotsCache[k]={t:Date.now(),dis};}
 const path=p.pathname+p.search;return !rules.dis.some(d=>{const re=new RegExp('^'+d.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\\\$$/,'$'));return re.test(path);});}
const ent=s=>String(s||'').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/&amp;/g,'&').replace(/&rsquo;|&lsquo;/g,'\u2019').replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/&ndash;/g,'\u2013').replace(/&mdash;/g,'\u2014').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const toText=h=>ent(h.replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' | ')).replace(/\s+/g,' ').replace(/(\| )+/g,'| ');
function t24(s){const m=String(s).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i);if(!m)return null;let h=+m[1]%12;if(/p/i.test(m[3]))h+=12;return String(h).padStart(2,'0')+':'+(m[2]||'00');}
const plus3=t=>{const [h,m]=t.split(':').map(Number);return String((h+3)%24).padStart(2,'0')+':'+String(m).padStart(2,'0');};
const ctParts=ms=>{const f=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));const g=k=>f.find(x=>x.type===k).value;return {date:`${g('year')}-${g('month')}-${g('day')}`,time:`${g('hour')}:${g('minute')}`};};
const nightOfMs=ms=>ctParts(ms-3*3600e3).date;
const TIME='(\\d{1,2}(?::\\d{2})?\\s?[AaPp]\\.?[Mm]\\.?)';
const NONMUSIC=/watch party|pilates|yoga|line danc|trivia|bingo|closed|private event|comedy|one man show/i;
function seg(t,startRe,endRe){const m=t.match(startRe);if(!m)return '';const rest=t.slice(m.index+m[0].length);const e=rest.search(endRe);return e<0?rest.slice(0,20000):rest.slice(0,e);}
function walk(x,out){if(Array.isArray(x))x.forEach(v=>walk(v,out));else if(x&&typeof x==='object'){if(/Event/.test(String(x['@type']))&&x.startDate)out.push(x);Object.values(x).forEach(v=>walk(v,out));}}
function ldEvents(h){const out=[];for(const m of h.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)){try{walk(JSON.parse(m[1]),out)}catch(e){}}return out;}
const P={
 jsonld(h,d){return ldEvents(h).filter(e=>!/T/.test(e.startDate)?String(e.startDate).slice(0,10)===d:nightOfMs(Date.parse(e.startDate))===d).map(e=>{
   if(/T/.test(e.startDate))return e;const n=ent(e.name),m=n.match(/^(\d{1,2}(?::\d{2})?)\s*([ap]m)?\s*[\u2013-]\s*(\d{1,2}(?::\d{2})?)\s*([ap]m)\s*[:\u2013-]\s*(.+)$/i);if(!m)return null;
   let a1=m[2];if(!a1){const h1=parseInt(m[1]),h2=parseInt(m[3]);a1=(h1%12)>(h2%12)?(/p/i.test(m[4])?'am':'pm'):m[4];}
   return {startT:t24(m[1]+a1),endT:t24(m[3]+m[4]),name:m[5],url:e.url};}).filter(Boolean).map(e=>e.startT?{start:e.startT,end:e.endT,name:e.name.trim(),url:e.url}:e)
  .map(e=>e.start?e:({start:ctParts(Date.parse(e.startDate)).time,end:e.endDate?ctParts(Date.parse(e.endDate)).time:null,name:ent(String(e.performer&&e.performer.name||e.name)).replace(/\s+at\s+.*$/,'').trim(),url:e.url}));},
 jsonld_old(h,d){return ldEvents(h).filter(e=>nightOfMs(Date.parse(e.startDate))===d).map(e=>({start:ctParts(Date.parse(e.startDate)).time,end:e.endDate?ctParts(Date.parse(e.endDate)).time:null,
   name:ent(String(e.performer&&e.performer.name||e.name)).replace(/^[\d:apm\s.\u2013-]+:\s*/i,'').replace(/\s+at\s+.*$/,'').trim(),url:e.url}));},
 nmc(h,d){return P.jsonld(h,d);},
 squarespace(h,d){let j;try{j=JSON.parse(h)}catch(e){return []}return (j.upcoming||j.items||[]).filter(e=>nightOfMs(e.startDate)===d).map(e=>({start:ctParts(e.startDate).time,end:e.endDate?ctParts(e.endDate).time:null,name:ent(e.title).replace(/^.*?\bft\.?\s+|^.*?\bfeat\.?\s+/i,'').trim(),url:e.fullUrl?'https://www.acmefeedandseed.com'+e.fullUrl:null,raw:ent(e.title)}));},
 sqsphtml(h,d){const [y,mo,da]=d.split('-').map(Number);const out=[];
   for(const m of h.matchAll(/<h1[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>\s*<\/h1>[\s\S]{0,200}?(\w+), (\w+) (\d{1,2}), (\d{4}),? (\d{1,2}:\d{2}\s?[AP]M)\s*(?:&ndash;|\u2013|-)\s*(\d{1,2}:\d{2}\s?[AP]M)/g)){
    if(m[4]!==MON[mo-1]||+m[5]!==da||+m[6]!==y)continue;const raw=ent(m[2]);out.push({start:t24(m[7]),end:t24(m[8]),name:raw.replace(/^.*?\bft\.?\s+|^.*?\bfeat\.?\s+/i,'').trim(),raw,url:new URL(m[1],'https://www.acmefeedandseed.com').href});}
   return out;},
 olered(h,d){const t=toText(h);const [y,mo,da]=d.split('-').map(Number);const hdr=new RegExp(`See Who's Playing Today \\| \\w+, ${MON[mo-1]} ${da} \\|`);
   const s=seg(t,hdr,/\| Calendar \|/);const out=[];for(const m of s.matchAll(new RegExp(`Ole Red Nashville \\| ([^|]+?) \\| ${TIME}\\s*[\\u2013-]\\s*${TIME}`,'g')))out.push({start:t24(m[2]),end:t24(m[3]),name:m[1].trim()});return out;},
 lukes(h,d){const t=toText(h);const [y,mo,da]=d.split('-').map(Number);const s=seg(t,new RegExp(`\\| ${MON[mo-1].slice(0,3)} ${da} \\|`),/\| [A-Z][a-z]{2} \d{1,2} \||WEEK OF/);
   return [...('|'+s).matchAll(new RegExp(`\\| ([^|]+?) \\| ([^|]*Stage[^|]*?) \\| ${TIME}`,'g'))].map(m=>({start:t24(m[3]),end:null,name:m[1].trim(),stage:m[2].trim()}));},
 casarosa(h,d){const t=toText(h);const [y,mo,da]=d.split('-').map(Number);const s=seg(t,new RegExp(`\\u2022 ${MON[mo-1]} ${da} \\|`,'i'),/\u2022 [A-Z][a-z]+ \d{1,2} \||\u2026{3,}|\.{5,}/);
   return [...('|'+s).matchAll(new RegExp(`\\| ${TIME} \\| \\u2022 (.+?) \\u2022 ([^|]+?) (?=\\|)`,'g'))].map(m=>({start:t24(m[1]),end:null,name:m[2].trim(),stage:m[3].trim()}));},
 bellb(h,d){const t=toText(h);const [y,mo,da]=d.split('-');const s=seg(t,new RegExp(`\\| ${mo}/${da}/${y} \\|`),/\| \d{2}\/\d{2}\/\d{4} \|/);
   return [...('|'+s).matchAll(new RegExp(`\\| ([^|]+?) \\| ${TIME}`,'g'))].filter(m=>!/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(m[1].trim())).map(m=>{const [n,st]=m[1].split(/,\s*(?=[^,]*Stage)/);return {start:t24(m[2]),end:null,name:n.trim(),stage:(st||'').trim()};});},
 redneck(h,d){const t=toText(h);const [y,mo,da]=d.split('-').map(Number);const ab=MON[mo-1].slice(0,3);
   return [...t.matchAll(new RegExp(`\\| ${ab} \\| ${da} \\| ${ab} \\| ${da} \\| \\w+ - ${TIME} \\| ([^|]+?) \\| View`,'g'))].map(m=>({start:t24(m[1]),end:null,name:m[2].trim()}));},
};
async function fetchSource(src,d){const diag={type:src.type,url:src.url};
 if(!(await robotsOk(src.url))){diag.status='robots-disallow';return {diag,events:[]};}
 let r,h;try{r=await fetch(src.url,{headers:{'User-Agent':UA,'Accept':src.type==='squarespace'?'application/json':'text/html'},redirect:'follow',signal:AbortSignal.timeout(25000)});h=await r.text();}
 catch(e){diag.status='error: '+e.message;return {diag,events:[]};}
 diag.http=r.status;diag.bytes=h.length;
 if(/One moment, please|cf-chl|Just a moment\.\.\.|captcha-delivery|Attention Required/i.test(h)&&h.length<60000){diag.status='blocked (bot challenge)';return {diag,events:[]};}
 if(!r.ok){diag.status='http '+r.status;return {diag,events:[]};}
 let ev=[];try{ev=P[src.type](h,d)}catch(e){diag.status='parse error: '+e.message;return {diag,events:[]};}
 ev=ev.filter(e=>e.start&&e.name&&e.name.length<=80&&!NONMUSIC.test(e.raw||e.name)).map(e=>({...e,end:e.end||plus3(e.start),url:e.url||src.url}));
 const seen=new Set();ev=ev.filter(e=>{const k=e.start+e.name.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;});
 diag.status='ok';diag.events=ev.length;return {diag,events:ev};}
async function barEvents(barId,d){const list=SOURCES[barId]||[];const diags=[];
 for(const s of list){const r=await fetchSource(s,d);diags.push(r.diag);if(r.events.length)return {source:s,events:r.events,diags};await new Promise(r=>setTimeout(r,1500));}
 return {source:null,events:[],diags};}
module.exports={SOURCES,barEvents,fetchSource,robotsOk,P,toText};
