// Band tip handles + public band pages + printable tip cards. We only build links to the payment apps; we never handle money.
const db=require('./db'),S=require('./scoring');
for(const c of ['slug','venmo','cashapp','paypal','instagram'])try{db.exec(`ALTER TABLE bands ADD COLUMN ${c} TEXT`)}catch(e){}
const BASE=(process.env.PUBLIC_BASE_URL||'https://broadway-tonight.onrender.com').replace(/\/$/,'');
const RULES={venmo:/^[A-Za-z0-9_-]{5,30}$/,cashapp:/^[A-Za-z][A-Za-z0-9_]{0,19}$/,paypal:/^[A-Za-z0-9]{1,20}$/,instagram:/^[A-Za-z0-9._]{1,30}$/};
const HOSTS={venmo:/venmo\.com$/i,cashapp:/cash\.app$/i,paypal:/paypal\.(me|com)$/i,instagram:/instagram\.com$/i};
// Accepts "@name", "$name", or a pasted profile URL; returns clean handle, '' to clear, or throws.
function cleanHandle(kind,v){let s=String(v==null?'':v).trim();if(!s)return '';
 if(/^https?:\/\//i.test(s)){let u;try{u=new URL(s)}catch(e){throw new Error(kind+': bad URL')}if(!HOSTS[kind].test(u.hostname.replace(/^www\./,'')))throw new Error(kind+': URL must be on '+HOSTS[kind].source.replace(/\\|\$/g,''));
  s=u.pathname.split('/').filter(Boolean).filter(x=>x!=='u'&&x!=='paypalme').pop()||'';}
 s=s.replace(/^[@$]/,'');if(!RULES[kind].test(s))throw new Error(`${kind}: invalid handle "${String(v).slice(0,40)}"`);return s;}
function links(b){if(!b)return null;const o={};
 if(b.venmo&&RULES.venmo.test(b.venmo))o.venmo='https://venmo.com/u/'+encodeURIComponent(b.venmo);
 if(b.cashapp&&RULES.cashapp.test(b.cashapp))o.cashapp='https://cash.app/$'+encodeURIComponent(b.cashapp);
 if(b.paypal&&RULES.paypal.test(b.paypal))o.paypal='https://paypal.me/'+encodeURIComponent(b.paypal);
 const tip=Object.keys(o).length?o:null;const ig=b.instagram&&RULES.instagram.test(b.instagram)?'https://instagram.com/'+encodeURIComponent(b.instagram):null;
 return {tip,instagram:ig};}
const slugify=n=>String(n||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'band';
function ensureSlugs(){const rows=db.prepare("SELECT id,name FROM bands WHERE slug IS NULL OR slug=''").all();if(!rows.length)return 0;
 const taken=new Set(db.prepare("SELECT slug FROM bands WHERE slug IS NOT NULL").all().map(r=>r.slug));const up=db.prepare('UPDATE bands SET slug=? WHERE id=?');
 db.transaction(()=>{for(const r of rows){if(r.id==='tba')continue;let s=slugify(r.name),k=2;while(taken.has(s))s=slugify(r.name)+'-'+k++;taken.add(s);up.run(s,r.id);}})();return rows.length;}
// Attach {slug,tip,instagram} to set rows that carry band_id
function decorate(rows){ensureSlugs();const q=db.prepare('SELECT id,slug,venmo,cashapp,paypal,instagram FROM bands WHERE id=?');const cache={};
 return rows.map(r=>{const id=r.band_id||r.bandId;if(!id||id==='tba')return r;const b=cache[id]||(cache[id]=q.get(id));if(!b)return r;const l=links(b);return {...r,bandSlug:b.slug,tip:l.tip,instagram:l.instagram};});}
function setHandles(bandId,h){const b=db.prepare('SELECT * FROM bands WHERE id=?').get(bandId);if(!b)throw new Error('no such band');const upd={};
 for(const k of ['venmo','cashapp','paypal','instagram'])if(h&&Object.prototype.hasOwnProperty.call(h,k))upd[k]=cleanHandle(k,h[k])||null;
 for(const [k,v] of Object.entries(upd))db.prepare(`UPDATE bands SET ${k}=? WHERE id=?`).run(v,bandId);return db.prepare('SELECT id,name,slug,venmo,cashapp,paypal,instagram FROM bands WHERE id=?').get(bandId);}
function bandBySlug(slug){let b=db.prepare('SELECT * FROM bands WHERE slug=?').get(String(slug));if(!b&&ensureSlugs())b=db.prepare('SELECT * FROM bands WHERE slug=?').get(String(slug));return b&&b.id!=='tba'?b:null;}
function bandPage(slug){const b=bandBySlug(slug);if(!b)return null;const today=S.ctNight();
 const sets=db.prepare('SELECT s.id,s.bar_id,s.date,s.set_start,s.set_end,br.name bar,br.address FROM sets s JOIN bars br ON br.id=s.bar_id WHERE s.band_id=? AND s.date>=? ORDER BY s.date,s.set_start LIMIT 20').all(b.id,today);
 const r=db.prepare('SELECT COUNT(*) n,AVG(rating) avg FROM ratings WHERE band_id=? AND hidden=0').get(b.id);const l=links(b);
 return {name:b.name,slug:b.slug,url:BASE+'/band/'+b.slug,tip:l.tip,instagram:l.instagram,rating:r.n?{avg:+r.avg.toFixed(2),n:r.n}:null,upcoming:sets};}
// Printable tip card (letter: 1 big card; small: 4 per page)
async function tipCardPdf(slug,layout,out){const PDF=require('pdfkit'),QR=require('qrcode');const p=bandPage(slug);if(!p)throw Object.assign(new Error('unknown band'),{code:404});
 const qr=await QR.toBuffer(p.url,{type:'png',margin:1,width:900,errorCorrectionLevel:'M',color:{dark:'#07060a',light:'#ffffff'}});
 const doc=new PDF({size:'LETTER',margin:0,info:{Title:p.name+' tip card · Broadway Tonight'}});doc.pipe(out);
 const W=612,H=792;const card=(x,y,w,h)=>{const s=w/612;
  doc.save();doc.roundedRect(x,y,w,h,18*s).fill('#07060a');
  const g=doc.linearGradient(x,y,x+w,y);g.stop(0,'#ff2d95').stop(1,'#ffd60a');doc.rect(x,y,w,10*s).fill(g);
  doc.roundedRect(x+14*s,y+24*s,w-28*s,h-38*s,14*s).lineWidth(3*s).strokeColor('#ff2d95').stroke();
  doc.fillColor('#ffd60a').font('Helvetica-Bold').fontSize(16*s).text('NASHVILLE · LOWER BROADWAY',x,y+52*s,{width:w,align:'center',characterSpacing:2*s});
  doc.fillColor('#f7f2ea').font('Helvetica-Bold').fontSize(40*s).text(p.name.toUpperCase(),x+30*s,y+84*s,{width:w-60*s,align:'center',height:110*s,ellipsis:true});
  doc.fillColor('#ff2d95').font('Helvetica-Bold').fontSize(56*s).text('Tip the band',x,y+200*s,{width:w,align:'center'});
  const q=300*s;doc.roundedRect(x+(w-q)/2-12*s,y+280*s,q+24*s,q+24*s,16*s).fill('#ffffff');doc.image(qr,x+(w-q)/2,y+292*s,{width:q,height:q});
  doc.fillColor('#f7f2ea').font('Helvetica-Bold').fontSize(24*s).text("Scan to tip + rate tonight's set",x,y+620*s,{width:w,align:'center'});
  doc.fillColor('#9a91a8').font('Helvetica').fontSize(13*s).text(p.url.replace(/^https:\/\//,''),x,y+654*s,{width:w,align:'center'});
  doc.fillColor('#b8ff3c').font('Helvetica-Bold').fontSize(22*s).text('BROADWAY TONIGHT',x,y+700*s,{width:w,align:'center',characterSpacing:3*s});
  doc.fillColor('#9a91a8').font('Helvetica').fontSize(9*s).text('Tips go straight to the band via their own payment app. Broadway Tonight never handles money.',x+30*s,y+732*s,{width:w-60*s,align:'center'});
  doc.restore();};
 if(layout==='small'){const m=18,cw=(W-3*m)/2,ch=(H-3*m)/2;for(let i=0;i<4;i++)card(m+(i%2)*(cw+m),m+Math.floor(i/2)*(ch+m),cw,ch);}
 else card(0,0,W,H);
 doc.end();return p;}
module.exports={cleanHandle,links,decorate,setHandles,bandPage,bandBySlug,ensureSlugs,tipCardPdf,slugify};
