// Verified social handles for set rows.
// Instagram: social/stories/handles.json — bands keyed by lowercase trimmed
// lineup name, bars keyed by bar_id. TikTok: data/band-tiktok.json.
// A missing file, a bad handle, or an unknown name yields nothing. Never guess.
const fs=require('fs'),path=require('path');
const IG_FILE=path.join(__dirname,'social','stories','handles.json');
const TT_FILE=path.join(__dirname,'data','band-tiktok.json');
const HANDLE_RE=/^[A-Za-z0-9._]{1,30}$/;

function bandKey(name){
  return String(name==null?'':name).trim().toLowerCase();
}
function cleanHandle(raw){
  let s=String(raw==null?'':raw).trim();
  if(!s)return '';
  if(/^https?:\/\//i.test(s)){
    let u;try{u=new URL(s);}catch(e){return '';}
    const host=u.hostname.replace(/^www\./,'').toLowerCase();
    const parts=u.pathname.split('/').filter(Boolean);
    if(host==='instagram.com')s=parts[0]||'';
    else if(host==='tiktok.com')s=(parts[0]||'').replace(/^@+/,'');
    else return '';
  }
  s=s.replace(/^@+/,'');
  if(!HANDLE_RE.test(s)||!/[A-Za-z0-9]/.test(s)||s.startsWith('.')||s.endsWith('.'))return '';
  return s;
}
function emptyIg(){return {bands:new Map(),bars:new Map()};}
function emptyTt(){return {bands:new Map()};}
function take(value,field){
  if(value==null)return '';
  if(typeof value==='string'||typeof value==='number')return cleanHandle(value);
  if(typeof value==='object'&&!Array.isArray(value)){
    if(value[field]!=null&&String(value[field]).trim()!=='')return cleanHandle(value[field]);
    if(field!=='handle'&&value.handle!=null)return cleanHandle(value.handle);
  }
  return '';
}
function indexInstagram(raw){
  const out=emptyIg();
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
  const bands=raw.bands;
  if(bands&&typeof bands==='object'&&!Array.isArray(bands)){
    for(const [k,v] of Object.entries(bands)){
      const key=bandKey(k),h=take(v,'instagram');
      if(key&&h)out.bands.set(key,h);
    }
  }else if(Array.isArray(bands)){
    for(const row of bands){
      const key=bandKey(row&&row.name),h=cleanHandle(row&&row.instagram);
      if(key&&h)out.bands.set(key,h);
    }
  }
  const bars=raw.bars;
  if(bars&&typeof bars==='object'&&!Array.isArray(bars)){
    for(const [k,v] of Object.entries(bars)){
      const key=String(k||'').trim(),h=take(v,'instagram');
      if(key&&h)out.bars.set(key,h);
    }
  }
  return out;
}
function indexTiktok(raw){
  const out=emptyTt();
  const bands=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw.bands:null;
  if(!bands||typeof bands!=='object'||Array.isArray(bands))return out;
  for(const [k,v] of Object.entries(bands)){
    const key=bandKey(k);
    const h=v&&typeof v==='object'&&!Array.isArray(v)?cleanHandle(v.tiktok):'';
    if(key&&h)out.bands.set(key,h);
  }
  return out;
}
function readJson(file){
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){return null;}
}
let igCache=null,igMtime=-1,ttCache=null,ttMtime=-1;
function loadCached(file,kind){
  const isIg=kind==='ig';
  let st;try{st=fs.statSync(file);}catch(e){
    if(isIg){igCache=null;igMtime=-1;}else{ttCache=null;ttMtime=-1;}
    return isIg?emptyIg():emptyTt();
  }
  if(isIg&&igCache&&st.mtimeMs===igMtime)return igCache;
  if(!isIg&&ttCache&&st.mtimeMs===ttMtime)return ttCache;
  const idx=isIg?indexInstagram(readJson(file)):indexTiktok(readJson(file));
  if(isIg){igCache=idx;igMtime=st.mtimeMs;}else{ttCache=idx;ttMtime=st.mtimeMs;}
  return idx;
}
function loadIg(){return loadCached(IG_FILE,'ig');}
function loadTt(){return loadCached(TT_FILE,'tt');}
function lookup(name,igIndex,ttIndex){
  const key=bandKey(name);
  const ig=key&&igIndex&&igIndex.bands?igIndex.bands.get(key):'';
  const tt=key&&ttIndex&&ttIndex.bands?ttIndex.bands.get(key):'';
  return {instagram:ig||null,tiktok:tt||null};
}
function forBand(name){return lookup(name,loadIg(),loadTt());}
function barInstagram(barId){
  const key=String(barId==null?'':barId).trim();
  if(!key)return null;
  return loadIg().bars.get(key)||null;
}
function instagramUrl(handle){
  const h=cleanHandle(handle);
  return h?'https://www.instagram.com/'+h+'/':null;
}
function tiktokUrl(handle){
  const h=cleanHandle(handle);
  return h?'https://www.tiktok.com/@'+h:null;
}
module.exports={bandKey,cleanHandle,indexInstagram,indexTiktok,lookup,forBand,barInstagram,instagramUrl,tiktokUrl,IG_FILE,TT_FILE};
