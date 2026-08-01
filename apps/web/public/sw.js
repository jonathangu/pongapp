// Retire PongApp's old cache-first shell. It could serve an outdated HTML
// document whose hashed JavaScript bundle had already been removed by a newer
// deployment, leaving returning players on a blank page. Keep this tiny worker
// published so existing registrations can update, clear themselves, and reload
// once onto the network-served app.
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('pongapp-')).map((key) => caches.delete(key)))
    await self.registration.unregister()
    await self.clients.claim()
    const clients = await self.clients.matchAll({ type: 'window' })
    await Promise.all(clients.map((client) => client.navigate(client.url)))
  })())
})
