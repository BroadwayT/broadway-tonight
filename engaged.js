// Who has interacted with Broadway Tonight. The ON NOW pill is only for a
// current set whose band matches this list. Edit engaged-bands.json; notes
// stay off the public site.
const fs=require('fs'),path=require('path');
const FILE=path.join(__dirname,'engaged-bands.json');
const normName=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\b(the|and)\b/g,' ').replace(/\s+/g,' ').trim();
function normHandle(s){
  let h=String(s||'').trim().toLowerCase();
  if(!h)return '';
  const m=h.match(/instagram\.com\/([a-z0-9._]+)/i);
  if(m)h=m[1];
  h=h.replace(/^@/,'').split(/[/?#\s]/)[0];
  return h;
}
let cache=null,mtime=0;
function load(){
  let st;try{st=fs.statSync(FILE);}catch(e){return {names:new Set(),handles:new Set()};}
  if(cache&&st.mtimeMs===mtime)return cache;
  let list=[];try{list=JSON.parse(fs.readFileSync(FILE,'utf8'));}catch(e){list=[];}
  if(list&&list.bands)list=list.bands;
  if(!Array.isArray(list))list=[];
  const names=new Set(),handles=new Set();
  for(const b of list){
    const n=normName(b&&b.name);if(n)names.add(n);
    const h=normHandle(b&&(b.instagram||b.handle));if(h)handles.add(h);
  }
  // Manual schedules sometimes name the act and put @handle in the source note.
  try{const manual=require('./manual-sets.json');
    for(const s of manual.sets||[]){
      const tags=[...String(s.source||'').matchAll(/@([a-z0-9._]+)/ig)].map(m=>m[1].toLowerCase());
      if(tags.some(t=>handles.has(t))){const n=normName(s.band);if(n)names.add(n);}
    }
  }catch(e){}
  cache={names,handles};mtime=st.mtimeMs;return cache;
}
function isEngaged(row){
  if(!row)return false;
  const {names,handles}=load();
  const n=normName(row.band||row.name);
  if(n&&names.has(n))return true;
  const h=normHandle(row.instagram||row.instagramHandle||'');
  return !!(h&&handles.has(h));
}
module.exports={isEngaged,normName,normHandle,load};
