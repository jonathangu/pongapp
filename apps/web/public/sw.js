const CACHE_NAME = 'pongapp-shell-v2'
const APP_ROOT = '/pongapp/'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([
    APP_ROOT,
    `${APP_ROOT}manifest.webmanifest`,
    `${APP_ROOT}favicon.svg`,
    `${APP_ROOT}icon-192.png`,
    `${APP_ROOT}icon-maskable-512.png`,
    `${APP_ROOT}arena-keyart.jpg`,
  ])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(APP_ROOT)) return
  event.respondWith(caches.match(request).then((cached) => {
    const fresh = fetch(request).then((response) => {
      if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
      return response
    }).catch(() => cached ?? (request.mode === 'navigate' ? caches.match(APP_ROOT) : Response.error()))
    return cached ?? fresh
  }))
})
