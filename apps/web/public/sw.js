/* Starling Rescue: opt-in atomic offline packs. Online HTML is network-first.
   A pack becomes active only after every exact asset has passed SHA-256 verification. */
const PACK_PREFIX = 'starling-pack-', META_CACHE = 'starling-meta-v1'
const BASE = new URL('./', self.location.href).pathname
const ACTIVE = new URL(BASE + '__starling_active__', self.location.origin).href
const COMPLETE = new URL(BASE + '__starling_complete__', self.location.origin).href
let download = null
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
async function activePack() {
  const response = await (await caches.open(META_CACHE)).match(ACTIVE)
  if (!response) return null
  try { const r = await response.json(); return r && typeof r.cache === 'string' && r.cache.startsWith(PACK_PREFIX) ? r : null } catch { return null }
}
async function checkedPack() {
  const active = await activePack()
  if (!active) return { ready: false, reason: 'not_downloaded' }
  const cache = await caches.open(active.cache), marker = await cache.match(COMPLETE)
  if (!marker) return { ready: false, reason: 'evicted', version: active.version }
  const manifest = await marker.json()
  for (const file of manifest.files) {
    const entry = await cache.match(new URL(file.url, self.location.origin).href)
    if (!entry || entry.headers.get('x-starling-sha256') !== file.sha256) return { ready: false, reason: 'evicted', version: active.version }
  }
  return { ready: true, version: manifest.version, bytes: manifest.bytes, files: manifest.files.length }
}
async function rangeResponse(request, response) {
  const range = request.headers.get('range')
  if (!response || !range) return response
  const bytes = await response.arrayBuffer(), length = bytes.byteLength
  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  const unsatisfied = () => new Response(null, { status: 416, headers: { 'content-range': `bytes */${length}`, 'accept-ranges': 'bytes' } })
  if (!match || (!match[1] && !match[2])) return unsatisfied()
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(Number(match[2]), length - 1) : length - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= length || end < start) return unsatisfied()
  const headers = new Headers(response.headers)
  headers.set('content-range', `bytes ${start}-${end}/${length}`); headers.set('content-length', String(end - start + 1)); headers.set('accept-ranges', 'bytes')
  return new Response(bytes.slice(start, end + 1), { status: 206, headers })
}
async function cachedResponse(request) {
  const active = await activePack()
  if (!active) return undefined
  const cache = await caches.open(active.cache)
  if (!await cache.match(COMPLETE)) return undefined
  // Godot runs in a same-origin child navigation. Never substitute the app home
  // document for that engine document when offline.
  const requested = new URL(request.url)
  const key = request.mode === 'navigate' && [BASE, BASE + 'index.html'].includes(requested.pathname) ? new URL(BASE, self.location.origin).href : request.url
  const response = await cache.match(key)
  if (response || request.mode === 'navigate') return rangeResponse(request, response)
  // An already-open old tab may still request its old hashed lazy chunk after an update.
  for (const key of await caches.keys()) if (key.startsWith(PACK_PREFIX) && key !== active.cache) {
    const previous = await caches.open(key)
    if (await previous.match(COMPLETE)) { const saved = await previous.match(request.url); if (saved) return rangeResponse(request, saved) }
  }
  return undefined
}
async function packManifestResponse(request) {
  try { const response = await fetch(request, { cache: 'no-store', signal: AbortSignal.timeout(4500) }); if (response.ok) return response } catch {}
  const active = await activePack()
  const manifest = active && await (await caches.open(active.cache)).match(COMPLETE)
  return manifest || new Response('Offline pack not downloaded', { status: 503 })
}
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE) || url.pathname.includes('/api/')) return
  if (url.pathname.endsWith('sw.js')) return
  if (url.pathname.endsWith('starling-pack.json')) { event.respondWith(packManifestResponse(request)); return }
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try { const response = await fetch(request, { cache: 'no-store', signal: AbortSignal.timeout(4500) }); if (response.ok) return response } catch {}
      return await cachedResponse(request) || new Response('<!doctype html><meta name="viewport" content="width=device-width"><title>Starling Rescue — offline</title><body style="background:#102b36;color:#fff1d8;font:18px system-ui;padding:32px"><h1>Your voyage is safe.</h1><p>Reconnect once, open Starling Rescue and download the offline pack. Then solo works without internet.</p><button onclick="location.reload()">Try again</button></body>', { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } })
    })())
  } else if (url.pathname.startsWith(BASE + 'godot/')) {
    // Engine export names are stable: prefer the current online release, with
    // the verified atomic pack as the offline fallback.
    event.respondWith((async () => {
      try { const response = await fetch(request, { cache: 'no-store' }); if (response.ok) return response } catch {}
      return await cachedResponse(request) || new Response('Offline game pack missing', { status: 503 })
    })())
  } else if (url.pathname.startsWith(BASE + 'assets/') || url.pathname.startsWith(BASE + 'art/starling/') || /\.(png|webmanifest|svg)$/.test(url.pathname)) {
    event.respondWith((async () => await cachedResponse(request) || fetch(request))())
  }
})
const send = (port, value) => { try { port?.postMessage(value) } catch {} }
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
function validateManifest(m) {
  return m && m.format === 'starling-pack-v1' && /^[a-f0-9]{20}$/.test(m.version) && Number.isSafeInteger(m.bytes) && m.bytes > 0 && m.bytes < 100000000 &&
    Array.isArray(m.files) && m.files.length > 3 && m.files.length < 400 && new Set(m.files.map(f => f.url)).size === m.files.length &&
    m.files.every(f => typeof f.url === 'string' && f.url.startsWith(BASE) && !f.url.includes('..') && !f.url.includes('?') && !f.url.includes('#') && /^[a-f0-9]{64}$/.test(f.sha256) && Number.isSafeInteger(f.bytes) && f.bytes > 0) && m.files.some(f => f.url === BASE)
}
async function installPack(port) {
  if (download) { send(port, { type: 'error', message: 'A download is already running in another tab.' }); return }
  const controller = new AbortController(); download = controller
  const deadline = setTimeout(() => controller.abort(), 19000)
  let staging = null
  try {
    const response = await fetch(BASE + 'starling-pack.json', { cache: 'no-store', signal: controller.signal })
    if (!response.ok) throw new Error('The offline pack is not available on this build yet.')
    const manifest = await response.json()
    if (!validateManifest(manifest)) throw new Error('The pack manifest is invalid. Your previous pack is unchanged.')
    const active = await activePack()
    if (active?.version === manifest.version && (await checkedPack()).ready) { send(port, { type: 'complete', ...(await checkedPack()) }); return }
    const estimate = await self.navigator.storage?.estimate?.()
    if (estimate?.quota && manifest.bytes * 1.25 > estimate.quota - (estimate.usage || 0)) throw new Error('Not enough free browser storage. Free some space and try again; your existing pack is safe.')
    staging = PACK_PREFIX + manifest.version + '-' + crypto.randomUUID()
    const cache = await caches.open(staging)
    let done = 0, bytes = 0
    for (const file of manifest.files) {
      if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      const asset = await fetch(file.url, { cache: 'no-store', signal: controller.signal })
      if (!asset.ok || asset.type === 'opaque') throw new Error('A game file failed to download. Your previous pack is unchanged.')
      const body = await asset.arrayBuffer()
      if (body.byteLength !== file.bytes || await digest(body) !== file.sha256) throw new Error('A game update arrived during download. Try again to get one complete matching version.')
      const headers = new Headers(asset.headers); headers.delete('content-encoding'); headers.delete('content-length'); headers.set('x-starling-sha256', file.sha256)
      await cache.put(new URL(file.url, self.location.origin).href, new Response(body, { status: 200, headers }))
      done++; bytes += body.byteLength; send(port, { type: 'progress', done, total: manifest.files.length, bytes, totalBytes: manifest.bytes })
    }
    if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
    await cache.put(COMPLETE, Response.json(manifest))
    await (await caches.open(META_CACHE)).put(ACTIVE, Response.json({ cache: staging, version: manifest.version, installedAt: Date.now() }))
    const preserve = new Set([staging, active?.cache]); staging = null
    try { for (const key of await caches.keys()) if (key.startsWith(PACK_PREFIX) && !preserve.has(key)) await caches.delete(key) } catch { /* pruning cannot invalidate a completed transaction */ }
    send(port, { type: 'complete', ready: true, version: manifest.version, bytes, files: done })
  } catch (error) {
    if (staging) await caches.delete(staging)
    send(port, { type: 'error', cancelled: error.name === 'AbortError', message: error.name === 'AbortError' ? 'Download cancelled. Your previous pack is unchanged.' : error.name === 'QuotaExceededError' ? 'Browser storage is full. Your previous pack is unchanged.' : error.message || 'Download failed. Your previous pack is unchanged.' })
  } finally { clearTimeout(deadline); download = null }
}
self.addEventListener('message', event => {
  const message = event.data, port = event.ports[0]
  if (message?.type === 'starling-download') event.waitUntil(installPack(port))
  else if (message?.type === 'starling-status') event.waitUntil(checkedPack().then(status => send(port, { type: 'status', ...status })).catch(() => send(port, { type: 'status', ready: false, reason: 'unavailable' })))
  else if (message?.type === 'starling-cancel') download?.abort()
})
