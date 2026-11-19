/* Broadway Tonight service worker.
 * Bump SHELL_VERSION when shell assets change so a new deploy is not stuck
 * behind an old cached page. Lineup responses live in a separate cache so
 * the last loaded lineup can still be used offline after a shell bump.
 */
const SHELL_VERSION = 'v2';
const SHELL_CACHE = 'bt-shell-' + SHELL_VERSION;
const DATA_CACHE = 'bt-data';
const CACHE_HEADER = 'X-BT-From-Cache';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/timefmt.js',
  '/live-band.js',
  '/share-lineup.js'
];

function isLineupApi(url) {
  return url.pathname === '/api/lineup';
}

function shouldCacheApi(url) {
  if (!url.pathname.startsWith('/api/')) return false;
  if (url.pathname.startsWith('/api/admin')) return false;
  if (url.pathname === '/api/collect' || url.pathname === '/api/subscribe') return false;
  return true;
}

function withCacheHeader(res) {
  const headers = new Headers(res.headers);
  headers.set(CACHE_HEADER, '1');
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers
  });
}

async function networkFirst(request, cacheName, deps) {
  const fetchFn = (deps && deps.fetch) || fetch;
  const cachesObj = (deps && deps.caches) || caches;
  const cache = await cachesObj.open(cacheName);
  try {
    const res = await fetchFn(request);
    if (res && res.ok) await cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return withCacheHeader(hit);
    throw err;
  }
}

async function cacheFirst(request, cacheName, deps) {
  const fetchFn = (deps && deps.fetch) || fetch;
  const cachesObj = (deps && deps.caches) || caches;
  const cache = await cachesObj.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetchFn(request);
  if (res && res.ok) await cache.put(request, res.clone());
  return res;
}

function isNavigation(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return request.destination === 'document' || accept.includes('text/html');
}

async function handleFetch(request, origin, deps) {
  const url = new URL(request.url);
  if (request.method !== 'GET') return (deps && deps.fetch ? deps.fetch(request) : fetch(request));
  if (url.origin !== origin) return (deps && deps.fetch ? deps.fetch(request) : fetch(request));

  if (shouldCacheApi(url)) {
    return networkFirst(request, DATA_CACHE, deps);
  }
  if (url.pathname.startsWith('/api/')) {
    return (deps && deps.fetch ? deps.fetch(request) : fetch(request));
  }
  if (isNavigation(request)) {
    try {
      return await networkFirst(request, SHELL_CACHE, deps);
    } catch (err) {
      const cachesObj = (deps && deps.caches) || caches;
      const shell = await cachesObj.open(SHELL_CACHE);
      return (await shell.match('/index.html')) || (await shell.match('/')) || Promise.reject(err);
    }
  }
  return cacheFirst(request, SHELL_CACHE, deps);
}

const IN_SW = typeof self !== 'undefined' && typeof self.skipWaiting === 'function';

if (IN_SW) {
  self.addEventListener('install', event => {
    event.waitUntil((async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL_ASSETS);
      await self.skipWaiting();
    })());
  });

  self.addEventListener('activate', event => {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key !== SHELL_CACHE && key !== DATA_CACHE)
          .map(key => caches.delete(key))
      );
      await self.clients.claim();
    })());
  });

  self.addEventListener('fetch', event => {
    event.respondWith(handleFetch(event.request, self.location.origin));
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SHELL_VERSION,
    SHELL_CACHE,
    DATA_CACHE,
    CACHE_HEADER,
    SHELL_ASSETS,
    isLineupApi,
    shouldCacheApi,
    withCacheHeader,
    networkFirst,
    cacheFirst,
    isNavigation,
    handleFetch
  };
}
