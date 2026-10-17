// Usage: node scripts/tipcard.js <band-slug> [out.pdf] [--small]   (uses DB_PATH; QR -> PUBLIC_BASE_URL/band/<slug>)
const fs=require('fs'),T=require('../tips');const a=process.argv.slice(2);const small=a.includes('--small');const [slug,out]=a.filter(x=>x!=='--small');
if(!slug){console.error('usage: node scripts/tipcard.js <band-slug> [out.pdf] [--small]');process.exit(1);}
const file=out||`tipcard-${slug}${small?'-4up':''}.pdf`;const ws=fs.createWriteStream(file);
T.tipCardPdf(slug,small?'small':'letter',ws).then(p=>ws.on('finish',()=>console.log('wrote',file,'->',p.url))).catch(e=>{console.error(e.message);process.exit(1)});
