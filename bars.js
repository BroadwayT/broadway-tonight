// Canonical Lower Broadway bar list (idempotent upsert on startup). Street order = river (1st Ave) -> 5th Ave.
const BARS=[
 ['acme',"Acme Feed & Seed",'101 Broadway','https://www.acmefeedandseed.com'],
 ['underground','Nashville Underground','105 Broadway','https://www.nashunderground.com'],
 ['wildhorse',"Luke Combs' Category 10",'120 2nd Ave N','https://www.category10.com'],
 ['chiefs',"Eric Church's Chief's",'200 Broadway','https://www.chiefsonbroadway.com'],
 ['bootleggers','Bootleggers Inn','207 Broadway','https://www.bootleggersnashville.com'],
 ['redneckriviera',"John Rich's Redneck Riviera",'208 Broadway','https://redneckrivieranashville.com'],
 ['goodnight',"Jelly Roll's Goodnight Nashville",'209 Broadway','https://goodnightnashville.com'],
 ['kidrock',"Kid Rock's Big Ass Honky Tonk Rock N' Roll Steakhouse",'221 Broadway','https://www.kidrockshonkytonkandsteakhouse.com'],
 ['bellbottomsup',"Lainey Wilson's Bell Bottoms Up",'120 3rd Ave S','https://bellbottomsupbar.com'],
 ['olered',"Blake Shelton's Ole Red Nashville",'300 Broadway','https://olered.com/nashville/'],
 ['luke32',"Luke's 32 Bridge",'301 Broadway','https://lukes32bridge.com'],
 ['postys',"Post Malone's Posty's",'305 Broadway','https://postysbar.com'],
 ['whiskeybent','Whiskey Bent Saloon','306 Broadway','https://whiskeybentnash.com'],
 ['aldeans',"Jason Aldean's Kitchen + Rooftop",'307 Broadway','https://jasonaldeansbar.com/nashville/'],
 ['casarosa',"Miranda Lambert's Casa Rosa",'308 Broadway','https://casarosanashville.com'],
 ['kanebrown',"Kane Brown's On Broadway",'312 Broadway','https://kanebrownsonbroadway.com'],
 ['tinroof','Tin Roof Broadway','316 Broadway','https://tinroofbroadway.com'],
 ['margaritaville','Margaritaville Nashville','322 Broadway','https://www.margaritavillenashville.com'],
 ['honkytonkcentral','Honky Tonk Central','329 Broadway','https://www.honkytonkcentral.com'],
 ['thisbar',"Morgan Wallen's This Bar & Tennessee Kitchen",'107 4th Ave N','https://mwthisbar.com'],
 ['whiskeyrow',"Dierks Bentley's Whiskey Row",'400 Broadway','https://dierkswhiskeyrow.com/nashville-tn/'],
 ['jbjs',"JBJ's Nashville",'405 Broadway','https://www.jbjsnash.com'],
 ['luckybastard','Lucky Bastard Saloon','408 Broadway','https://www.luckybastardsaloon.com'],
 ['nudies',"Nudie's Honky Tonk",'409 Broadway','https://www.nudieshonkytonk.com'],
 ['flp',"Garth Brooks' Friends in Low Places",'411 Broadway','https://www.friendsbarnashville.com'],
 ['bootbarn','The Stage on Broadway','412 Broadway','https://thestageonbroadway.com'],
 ['roberts',"Robert's Western World",'416 Broadway','https://www.robertswesternworld.com'],
 ['layla',"Layla's Honky Tonk",'418 Broadway','https://www.laylasnashville.com'],
 ['boogiebar',"Hank Williams Jr.'s Boogie Bar",'419 Broadway','https://www.hanksnash.com'],
 ['ajs',"AJ's Good Time Bar",'421 Broadway','https://www.ajsgoodtimebar.com'],
 ['tootsies',"Tootsie's Orchid Lounge",'422 Broadway','https://www.tootsies.net'],
 ['legends','Legends Corner','428 Broadway','https://legendscorner.com'],
 ['rippys',"Rippy's Smokin' Bar & Grill",'429 Broadway','https://www.rippyshonkytonk.com'],
];
const STREET_ORDER=Object.fromEntries(BARS.map((b,i)=>[b[0],i+1]));
function upsertBars(db){const crypto=require('crypto');
 const ins=db.prepare('INSERT OR IGNORE INTO bars(id,name,address) VALUES(?,?,?)');let added=0;
 db.transaction(()=>{for(const b of BARS)added+=ins.run(b[0],b[1],b[2]).changes;
  db.prepare("UPDATE bars SET name=?,address=? WHERE id='wildhorse'").run("Luke Combs' Category 10",'120 2nd Ave N');
  for(const b of db.prepare('SELECT id FROM bars WHERE id NOT IN (SELECT bar_id FROM owner_tokens)').all())
   db.prepare('INSERT INTO owner_tokens(token,bar_id,created_at) VALUES(?,?,?)').run(crypto.randomBytes(24).toString('hex'),b.id,Date.now());})();
 return added;}
module.exports={BARS,STREET_ORDER,upsertBars};
