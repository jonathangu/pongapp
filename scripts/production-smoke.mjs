const siteUrl = new URL(process.env.PONGAPP_SITE_URL ?? 'https://www.jonathangu.com/pongapp/')
const roomServerUrl = process.env.ROOM_SERVER_URL ?? 'https://pongapp-room.pongapp-room-worker.workers.dev'
const deploymentId = process.env.DEPLOYMENT_ID ?? Date.now().toString(36)

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

async function fetchCurrent(pathname) {
  const url = new URL(pathname, siteUrl)
  url.searchParams.set('deploy', deploymentId)
  return fetch(url, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } })
}

async function verifyDeployment() {
  const pageResponse = await fetchCurrent(siteUrl.pathname)
  invariant(pageResponse.ok, `PongApp page returned ${pageResponse.status}`)
  const html = await pageResponse.text()
  invariant(html.includes('Starling Rescue'), 'PongApp page did not contain the Starling Rescue release')
  const scriptPath = html.match(/src="(\/pongapp\/assets\/index-[^"]+\.js)"/)?.[1]
  invariant(scriptPath, 'PongApp page did not reference its production JavaScript bundle')

  const scriptResponse = await fetchCurrent(scriptPath)
  invariant(scriptResponse.ok, `PongApp bundle returned ${scriptResponse.status}`)
  const script = await scriptResponse.text()
  invariant(script.includes(roomServerUrl), `PongApp bundle did not target ${roomServerUrl}`)
  invariant(!script.includes('pongapp-room.fly.dev'), 'PongApp bundle still targeted the regional Fly room endpoint')
  for (const text of ['Starling Rescue', 'Open five cages.', 'Friends for the journey', 'Lantern Wake', 'starling-pack.json', 'galley.glb']) {
    invariant(script.includes(text), `PongApp bundle is missing Starling release marker: ${text}`)
  }
  const legacyChunk = script.match(/App-[A-Za-z0-9_-]+\.js/)?.[0]
  invariant(legacyChunk, 'Legacy game entry is missing')
  const legacyResponse = await fetchCurrent('/pongapp/assets/' + legacyChunk)
  const legacy = await legacyResponse.text()
  invariant(legacyResponse.ok && legacy.includes('TWO CREW. FOUR ROOMS. ONE SHIP.'), 'Preserved classic modes are missing')
  const sceneChunk = legacy.match(/TinyWorldScene-[A-Za-z0-9_-]+\.js/)?.[0] ?? script.match(/TinyWorldScene-[A-Za-z0-9_-]+\.js/)?.[0]
  invariant(sceneChunk, 'PongApp bundle did not include the lazy 3D renderer')
  const sceneResponse = await fetchCurrent('/pongapp/assets/' + sceneChunk)
  const sceneScript=await sceneResponse.text()
  invariant(sceneResponse.ok && sceneScript.includes('tiny-worlds.glb') && sceneScript.includes('rolling-cylinder'), 'Rolling-world 3D renderer chunk missing or stale')
  for (const name of ['tiny-worlds.glb', 'painted-material.jpg']) {
    const response = await fetchCurrent('/pongapp/art/' + name)
    invariant(response.ok, `${name} returned ${response.status}`)
    const served = Buffer.from(await response.arrayBuffer())
    const expected = readFileSync(new URL('../apps/web/public/art/' + name, import.meta.url))
    const hash = bytes => createHash('sha256').update(bytes).digest('hex')
    invariant(hash(served) === hash(expected), `${name} does not match this release`)
  }

  const workerResponse = await fetchCurrent('/pongapp/sw.js')
  invariant(workerResponse.ok, `Offline service worker returned ${workerResponse.status}`)
  const worker = await workerResponse.text()
  const expectedWorker = readFileSync(new URL('../apps/web/public/sw.js', import.meta.url), 'utf8')
  invariant(worker === expectedWorker, 'Atomic offline worker does not match this release')
  const packResponse = await fetchCurrent('/pongapp/starling-pack.json')
  invariant(packResponse.ok, 'Offline pack manifest is missing')
  const pack = await packResponse.json()
  invariant(pack.format === 'starling-pack-v1' && pack.files.length >= 25, 'Offline pack is incomplete')
  if (process.env.DEPLOYMENT_ID) invariant(pack.revision === deploymentId, `Served revision ${pack.revision} does not match ${deploymentId}`)
  for (let offset = 0; offset < pack.files.length; offset += 5) await Promise.all(pack.files.slice(offset, offset + 5).map(async file => {
    const response = await fetchCurrent(file.url), bytes = Buffer.from(await response.arrayBuffer())
    invariant(response.ok && bytes.length === file.bytes && createHash('sha256').update(bytes).digest('hex') === file.sha256, `Offline asset hash mismatch: ${file.url}`)
  }))

  const healthResponse = await fetch(new URL('/api/health', roomServerUrl), { cache: 'no-store' })
  invariant(healthResponse.ok, `Room health returned ${healthResponse.status}`)
  const health = await healthResponse.json()
  invariant(health.protocol === 10, `Room server protocol was ${health.protocol}, expected 10`)
  invariant(health.rescueProtocol === 1, `Starling room protocol was ${health.rescueProtocol}, expected 1`)
  invariant(health.runtime === 'cloudflare-durable-objects', `Room server runtime was ${health.runtime}, expected Cloudflare Durable Objects`)
  console.log(`production-smoke ok: ${siteUrl.href} -> ${scriptPath} -> ${roomServerUrl}`)
}

let finalError
for (let attempt = 1; attempt <= 12; attempt += 1) {
  try {
    await verifyDeployment()
    process.exit(0)
  } catch (error) {
    finalError = error
    if (attempt < 12) await new Promise((resolve) => setTimeout(resolve, 5_000))
  }
}

throw finalError
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
