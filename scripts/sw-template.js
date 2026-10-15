// Beacyn Chess service worker: makes the app installable and lets play, puzzles and
// lessons work offline. Generated at build time (see vite.config.ts); the two
// placeholders below are filled in with the build's file list and a version hash.
/* eslint-disable no-restricted-globals */
const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__
const CACHE = `beacyn-${VERSION}`
// The optional AI code is large and only for people who turn it on: never cached here.
const SKIP = /\/assets\/(webllm|anthropic)-/

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('beacyn-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || SKIP.test(url.pathname)) return

  // Pages: network first so a new version shows up right away; the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          void caches.open(CACHE).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./', { ignoreVary: true }).then((r) => r || Response.error())),
    )
    return
  }

  // Files: from the cache when we have them (they are versioned by name), else the network.
  event.respondWith(
    // ignoreVary: module scripts send an Origin header, and a Vary on it would otherwise miss the cache.
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone()
            void caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
