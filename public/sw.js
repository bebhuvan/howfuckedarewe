/**
 * Service Worker for howfuckedarewe.in
 *
 * Strategy:
 * - Static assets: Cache-first (long-lived)
 * - HTML pages: Network-first with cache fallback
 * - API data: Network-first with 10-minute cache
 * - Offline: Serve cached content or offline page
 */

const CACHE_VERSION = 'hfaw-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Static assets to pre-cache on install
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/offline.html',
];

// Install: Pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key.startsWith('hfaw-') && key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== API_CACHE)
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: Apply caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests except WAQI API
  if (url.origin !== self.location.origin && !url.hostname.includes('waqi.info')) {
    return;
  }

  // API requests: Network-first with 10-minute cache
  if (url.hostname.includes('waqi.info')) {
    event.respondWith(networkFirstWithTimeout(request, API_CACHE, 10 * 60 * 1000));
    return;
  }

  // Static assets: Cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML pages: Network-first with cache fallback
  if (request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(networkFirstWithFallback(request, DYNAMIC_CACHE));
    return;
  }

  // Default: Network-first
  event.respondWith(networkFirstWithTimeout(request, DYNAMIC_CACHE, 60 * 60 * 1000));
});

// Check if request is for a static asset
function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i.test(pathname);
}

// Cache-first strategy
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response('Offline', { status: 503 });
  }
}

// Network-first with timeout and cache
async function networkFirstWithTimeout(request, cacheName, maxAge) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      const headers = new Headers(response.headers);
      headers.set('sw-cached-at', Date.now().toString());
      const cachedResponse = new Response(await response.clone().blob(), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      cache.put(request, cachedResponse);
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      const cachedAt = parseInt(cached.headers.get('sw-cached-at') || '0', 10);
      if (Date.now() - cachedAt < maxAge) {
        return cached;
      }
    }
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Network-first with offline fallback for HTML
async function networkFirstWithFallback(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Return offline page for HTML requests
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) return offlinePage;

    return new Response(getOfflineHTML(), {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

// Inline offline HTML fallback
function getOfflineHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Offline | How Fucked Are We</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a0a;
      color: #fafaf9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2rem;
    }
    h1 { font-size: 2rem; margin-bottom: 1rem; color: #991b1b; }
    p { color: rgba(255,255,255,0.6); margin-bottom: 1rem; }
    .subtext { font-size: 0.875rem; color: rgba(255,255,255,0.4); }
    button {
      margin-top: 1.5rem;
      padding: 0.75rem 1.5rem;
      background: #991b1b;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
    }
    button:hover { background: #7f1d1d; }
  </style>
</head>
<body>
  <div>
    <h1>You're Offline</h1>
    <p>Even our servers need a breath of fresh air.</p>
    <p class="subtext">The air quality data requires an internet connection.<br>But honestly, it probably got worse since you last checked.</p>
    <button onclick="location.reload()">Try Again</button>
  </div>
</body>
</html>`;
}

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
