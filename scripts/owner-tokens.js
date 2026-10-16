const crypto=require('crypto'),fs=require('fs'),path=require('path');const db=require('../db');
const bars=db.prepare('SELECT id,name FROM bars ORDER BY name').all();const out=[];
for(const b of bars){let t=db.prepare('SELECT token FROM owner_tokens WHERE bar_id=?').get(b.id);
 if(!t){t={token:crypto.randomBytes(24).toString('hex')};db.prepare('INSERT INTO owner_tokens(token,bar_id,created_at) VALUES(?,?,?)').run(t.token,b.id,Date.now());}
 out.push(`${b.id}\t${b.name}\thttp://127.0.0.1:3847/owner/${t.token}`);}
fs.writeFileSync(path.join(__dirname,'..','data','owner-links.txt'),out.join('\n')+'\n');console.log(out.length+' links');
