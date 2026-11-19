const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const SW = require('../public/sw');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

function read(rel) {
  return fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
}

function pngSize(rel) {
  const buf = fs.readFileSync(path.join(PUBLIC, rel));
  assert.equal(buf.toString('ascii', 1, 4), 'PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test('manifest names the app, opens standalone on tonight lineup, and lists any plus maskable icons', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'Broadway Tonight');
  assert.equal(manifest.short_name, 'Broadway');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/#lineup');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.theme_color, '#07060a');
  assert.equal(manifest.background_color, '#07060a');
  const byPurpose = {};
  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\//);
    assert.equal(icon.type, 'image/png');
    assert.ok(!/\bany maskable\b/.test(icon.purpose), 'icons must not combine any and maskable');
    const purposes = String(icon.purpose).split(/\s+/);
    for (const purpose of purposes) {
      (byPurpose[purpose] ||= new Set()).add(icon.sizes);
    }
    const [w, h] = icon.sizes.split('x').map(Number);
    const file = path.join(PUBLIC, icon.src.replace(/^\//, ''));
    assert.equal(fs.existsSync(file), true, icon.src + ' is missing');
    assert.deepEqual(pngSize(icon.src.replace(/^\//, '')), { width: w, height: h });
  }
  assert.ok(byPurpose.any.has('192x192') && byPurpose.any.has('512x512'));
  assert.ok(byPurpose.maskable.has('192x192') && byPurpose.maskable.has('512x512'));
});

test('apple-touch-icon is 180px and the head has iOS web-app and splash tags', () => {
  assert.deepEqual(pngSize('apple-touch-icon.png'), { width: 180, height: 180 });
  const html = read('index.html');
  assert.match(html, /apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="mobile-web-app-capable" content="yes"/);
  assert.match(html, /apple-mobile-web-app-title" content="Broadway Tonight"/);
  assert.match(html, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png"/);
  assert.match(html, /--safe-t:env\(safe-area-inset-top/);
  assert.match(html, /padding:calc\(16px \+ var\(--safe-t\)\)/);
  assert.match(html, /top:calc\(14px \+ var\(--safe-t\)\)/);
  const splashes = [
    '1170x2532', '1179x2556', '1206x2622', '1284x2778', '1290x2796',
    '1320x2868', '1125x2436', '1242x2688', '828x1792', '750x1334'
  ];
  for (const size of splashes) {
    const [w, h] = size.split('x').map(Number);
    assert.match(html, new RegExp(`apple-touch-startup-image" href="/splash/${size}\\.png"`));
    assert.deepEqual(pngSize(path.join('splash', size + '.png')), { width: w, height: h });
  }
});

test('Add to Home Screen is dismissible, hidden in standalone, and shows iPhone Share steps', () => {
  const html = read('index.html');
  assert.match(html, /id="installBtn"/);
  assert.match(html, /id="installDismiss"/);
  assert.match(html, /Not now/);
  assert.match(html, /INSTALL_HIDE_KEY='bt_install_hide'/);
  assert.match(html, /display-mode: standalone/);
  assert.match(html, /beforeinstallprompt/);
  assert.match(html, /Tap the Share icon at the bottom of Safari/);
  assert.match(html, /tap Add to Home Screen/);
  const sheet = html.slice(html.indexOf('id="installTitle"'), html.indexOf('id="installSheetClose"'));
  assert.doesNotMatch(sheet, /!/);
  assert.doesNotMatch(sheet, /\u2014|\u2013/);
});

test('home-screen launch lands on tonight lineup without a smooth scroll from the top', () => {
  const html = read('index.html');
  assert.match(html, /function openLineupView/);
  assert.match(html, /markNav\('#nav-lineup'\)/);
  assert.match(html, /scrollToSection\(\$\('#lineupAnchor'\),instant\)/);
  assert.match(html, /landOnLineup/);
  assert.match(html, /behavior:instant\?'auto':'smooth'/);
  assert.match(html, /openLineupView\(true,false\)/);
});

test('service worker uses a versioned shell cache and network-first lineup', () => {
  assert.match(SW.SHELL_CACHE, new RegExp('^bt-shell-' + SW.SHELL_VERSION + '$'));
  assert.equal(SW.DATA_CACHE, 'bt-data');
  assert.equal(SW.isLineupApi(new URL('https://broadwaytonightnash.com/api/lineup?date=today')), true);
  assert.equal(SW.shouldCacheApi(new URL('https://example.com/api/lineup?date=today')), true);
  assert.equal(SW.shouldCacheApi(new URL('https://example.com/api/picks')), true);
  assert.equal(SW.shouldCacheApi(new URL('https://example.com/api/admin/featured')), false);
  assert.equal(SW.shouldCacheApi(new URL('https://example.com/api/collect')), false);
  assert.equal(SW.shouldCacheApi(new URL('https://example.com/api/subscribe')), false);
  const swSrc = read('sw.js');
  assert.match(swSrc, /skipWaiting/);
  assert.match(swSrc, /clients\.claim/);
  assert.match(swSrc, /networkFirst/);
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(server, /basename\(filePath\)==='sw\.js'/);
  assert.match(server, /Cache-Control','no-cache'/);
  for (const asset of SW.SHELL_ASSETS) {
    const rel = asset === '/' ? 'index.html' : asset.replace(/^\//, '');
    assert.equal(fs.existsSync(path.join(PUBLIC, rel)), true, asset + ' is listed in the shell but missing');
  }
  assert.match(read('index.html'), /serviceWorker\.register\('\/sw\.js'\)/);
});

function memoryCaches() {
  const stores = new Map();
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const bag = stores.get(name);
      return {
        async put(req, res) { bag.set(typeof req === 'string' ? req : req.url, res); },
        async match(req) { const hit=bag.get(typeof req === 'string' ? req : req.url); return hit?hit.clone():undefined; }
      };
    }
  };
}

test('network-first returns a live lineup when online and does not keep a failed response', async () => {
  const caches = memoryCaches();
  const req = { url: 'https://broadwaytonightnash.com/api/lineup?date=today' };
  const stale = new Response(JSON.stringify({ date: '2026-11-17', sets: [] }), { status: 200 });
  await (await caches.open(SW.DATA_CACHE)).put(req, stale);
  const liveBody = JSON.stringify({ date: '2026-11-18', sets: [{ band: 'Live' }] });
  const res = await SW.networkFirst(req, SW.DATA_CACHE, {
    caches,
    fetch: async () => new Response(liveBody, { status: 200 })
  });
  assert.equal(await res.text(), liveBody);
  const cached = await (await caches.open(SW.DATA_CACHE)).match(req);
  assert.equal(await cached.text(), liveBody);

  const failed = await SW.networkFirst(req, SW.DATA_CACHE, {
    caches,
    fetch: async () => new Response('nope', { status: 500 })
  });
  assert.equal(failed.status, 500);
  const still = await (await caches.open(SW.DATA_CACHE)).match(req);
  assert.equal(await still.text(), liveBody);
});

test('network-first falls back to the last lineup only when the network fails', async () => {
  const caches = memoryCaches();
  const req = { url: 'https://broadwaytonightnash.com/api/lineup?date=today' };
  const saved = JSON.stringify({ date: '2026-11-18', sets: [{ band: 'Saved' }] });
  await (await caches.open(SW.DATA_CACHE)).put(req, new Response(saved, { status: 200 }));
  const res = await SW.networkFirst(req, SW.DATA_CACHE, {
    caches,
    fetch: async () => { throw new Error('offline'); }
  });
  assert.equal(res.headers.get(SW.CACHE_HEADER), '1');
  assert.equal(await res.text(), saved);
});

test('navigations stay network-first so a deploy is not stuck on an old shell', async () => {
  const caches = memoryCaches();
  const req = {
    url: 'https://broadwaytonightnash.com/',
    method: 'GET',
    mode: 'navigate',
    destination: 'document',
    headers: { get: () => 'text/html' }
  };
  const oldShell = new Response('<html>old</html>', { status: 200 });
  await (await caches.open(SW.SHELL_CACHE)).put(req, oldShell);
  const fresh = await SW.handleFetch(req, 'https://broadwaytonightnash.com', {
    caches,
    fetch: async () => new Response('<html>new</html>', { status: 200 })
  });
  assert.equal(await fresh.text(), '<html>new</html>');

  const offline = await SW.handleFetch(req, 'https://broadwaytonightnash.com', {
    caches,
    fetch: async () => { throw new Error('offline'); }
  });
  assert.equal(await offline.text(), '<html>new</html>');
});
