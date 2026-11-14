const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');

process.env.DB_PATH=path.join(os.tmpdir(),'bt-socials-'+process.pid+'.db');

const SOCIAL=require('../socials');
const db=require('../db');
const TIPS=require('../tips');

test('instagram and tiktok urls use the profile handle only',()=>{
  assert.equal(SOCIAL.instagramUrl('willclarkcountry'),'https://www.instagram.com/willclarkcountry/');
  assert.equal(SOCIAL.instagramUrl('@rodneygriffin_music'),'https://www.instagram.com/rodneygriffin_music/');
  assert.equal(SOCIAL.tiktokUrl('willclarkcountry'),'https://www.tiktok.com/@willclarkcountry');
  assert.equal(SOCIAL.instagramUrl(''),null);
  assert.equal(SOCIAL.instagramUrl('not a handle'),null);
  assert.equal(SOCIAL.tiktokUrl('https://evil.example/x'),null);
});

test('handles are cleaned and bad ones are dropped',()=>{
  assert.equal(SOCIAL.cleanHandle('  @WillClarkCountry '), 'WillClarkCountry');
  assert.equal(SOCIAL.cleanHandle('https://www.instagram.com/willclarkcountry/'), 'willclarkcountry');
  assert.equal(SOCIAL.cleanHandle('https://www.tiktok.com/@willclarkcountry'), 'willclarkcountry');
  assert.equal(SOCIAL.cleanHandle('https://instagram.com/willclarkcountry?hl=en'), 'willclarkcountry');
  assert.equal(SOCIAL.cleanHandle('will clark'), '');
  assert.equal(SOCIAL.cleanHandle('../will'), '');
  assert.equal(SOCIAL.cleanHandle('.'), '');
  assert.equal(SOCIAL.cleanHandle(''), '');
});

test('band match is lowercase and trimmed, and unknown names stay empty',()=>{
  const ig=SOCIAL.indexInstagram({
    bands:{
      '  Will Clark ': {instagram:'@willclarkcountry'},
      'rodney griffin & the fiddlequeen': 'https://www.instagram.com/rodneygriffin_music/',
      'bad act': {instagram:'nope nope'},
      'empty act': {instagram:''}
    },
    bars:{
      whiskeybent:{instagram:'whiskeybentnash'},
      '  blank  ':'  '
    }
  });
  const tt=SOCIAL.indexTiktok({bands:{'will clark':{tiktok:'@willclarkcountry'}, 'string act':'not-an-object'}});
  assert.deepEqual(SOCIAL.lookup('Will Clark', ig, tt), {instagram:'willclarkcountry', tiktok:'willclarkcountry'});
  assert.deepEqual(SOCIAL.lookup('  WILL CLARK  ', ig, tt), {instagram:'willclarkcountry', tiktok:'willclarkcountry'});
  assert.deepEqual(SOCIAL.lookup('Rodney Griffin & The FiddleQueen', ig, tt), {instagram:'rodneygriffin_music', tiktok:null});
  assert.deepEqual(SOCIAL.lookup('Will  Clark', ig, tt), {instagram:null, tiktok:null});
  assert.deepEqual(SOCIAL.lookup('Will Clark Band', ig, tt), {instagram:null, tiktok:null});
  assert.deepEqual(SOCIAL.lookup('bad act', ig, tt), {instagram:null, tiktok:null});
  assert.deepEqual(SOCIAL.lookup('', ig, tt), {instagram:null, tiktok:null});
  assert.equal(ig.bars.get('whiskeybent'), 'whiskeybentnash');
  assert.equal(ig.bars.has('blank'), false);
  assert.equal(tt.bands.has('string act'), false);
});

test('the verified instagram file is the set-row source',()=>{
  const hit=SOCIAL.forBand('  Will Clark ');
  assert.equal(hit.instagram, 'willclarkcountry');
  assert.equal(hit.tiktok, null);
  assert.equal(SOCIAL.instagramUrl(hit.instagram), 'https://www.instagram.com/willclarkcountry/');
  const rod=SOCIAL.forBand('Rodney Griffin & The FiddleQueen');
  assert.equal(rod.instagram, 'rodneygriffin_music');
  assert.equal(rod.tiktok, null);
  assert.deepEqual(SOCIAL.forBand('Sarah Gayle Meech'), {instagram:null, tiktok:null});
  assert.deepEqual(SOCIAL.forBand('Mac Watts'), {instagram:null, tiktok:null});
  assert.equal(SOCIAL.barInstagram('whiskeybent'), null);
  assert.equal(SOCIAL.barInstagram(''), null);
  const raw=JSON.parse(fs.readFileSync(SOCIAL.TT_FILE, 'utf8'));
  assert.deepEqual(raw.bands, {});
});

test('decorate attaches handles and leaves unknown bands blank',()=>{
  db.prepare('INSERT INTO bands(id,name) VALUES(?,?)').run('will','Will Clark');
  db.prepare('INSERT INTO bands(id,name) VALUES(?,?)').run('nope','Blair Joseph');
  db.prepare('INSERT INTO bands(id,name) VALUES(?,?)').run('tba','Live music (TBA)');
  const rows=TIPS.decorate([
    {id:'s1', band_id:'will', band:'Will Clark'},
    {id:'s2', band_id:'nope', band:'Blair Joseph'},
    {id:'s3', band_id:'tba', band:'Live music (TBA)'}
  ]);
  assert.equal(rows[0].ig, 'willclarkcountry');
  assert.equal(rows[0].igUrl, 'https://www.instagram.com/willclarkcountry/');
  assert.equal(rows[0].tt, null);
  assert.equal(rows[0].ttUrl, null);
  assert.equal(rows[0].bandSlug!=null, true);
  assert.equal(rows[1].ig, null);
  assert.equal(rows[1].igUrl, null);
  assert.equal(rows[1].tt, null);
  assert.equal(rows[2].ig, null);
  assert.equal(rows[2].bandSlug, undefined);
});

test('the lineup page no longer renders band ratings',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  assert.equal(html.includes('Rate this band'), false);
  assert.equal(html.includes('beginRate'), false);
  assert.equal(html.includes('vibeSheet'), false);
  assert.equal(html.includes('Pick a vibe'), false);
  assert.equal(html.includes("I'm here"), false);
  assert.equal(html.includes('rated ✓'), false);
  assert.equal(html.includes('set-social'), true);
  assert.equal(html.includes('s.igUrl'), true);
  assert.equal(html.includes('s.ttUrl'), true);
  assert.equal(/No (Instagram|TikTok)|handle unknown|follow them/i.test(html), false);
});

test.after(()=>{
  try{fs.unlinkSync(process.env.DB_PATH);}catch(e){}
  try{fs.unlinkSync(process.env.DB_PATH+'-wal');}catch(e){}
  try{fs.unlinkSync(process.env.DB_PATH+'-shm');}catch(e){}
});
