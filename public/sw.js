/* Clip Studio service worker — lightweight app-shell caching for offline use. */
const CACHE = 'clip-studio-v1'
// Precache the app shell. Hashed JS/CSS are cached at runtime instead.
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './pwa-192.png',
  './pwa-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  // Navigation requests: network-first, fall back to cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html').then((r) => r ?? Response.error())),
    )
    return
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
