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
  invariant(html.includes('Two Oars'), 'PongApp page did not contain the Two Oars release')
  const scriptPath = html.match(/src="(\/pongapp\/assets\/index-[^"]+\.js)"/)?.[1]
  invariant(scriptPath, 'PongApp page did not reference its production JavaScript bundle')

  const scriptResponse = await fetchCurrent(scriptPath)
  invariant(scriptResponse.ok, `PongApp bundle returned ${scriptResponse.status}`)
  const script = await scriptResponse.text()
  invariant(script.includes(roomServerUrl), `PongApp bundle did not target ${roomServerUrl}`)
  invariant(!script.includes('pongapp-room.fly.dev'), 'PongApp bundle still targeted the regional Fly room endpoint')
  for (const text of ['FOUR BUTTONS. ONE TEAM.', 'Tap to nudge', 'Big splash shell', 'RECOVERED +1 HEART']) {
    invariant(script.includes(text), `PongApp bundle is missing tap-combat release marker: ${text}`)
  }

  const sceneChunk = script.match(/TinyWorldScene-[A-Za-z0-9_-]+\.js/)?.[0]
  invariant(sceneChunk, 'PongApp bundle did not include the lazy 3D renderer')
  const sceneResponse = await fetchCurrent('/pongapp/assets/' + sceneChunk)
  invariant(sceneResponse.ok && (await sceneResponse.text()).includes('tiny-worlds.glb'), '3D renderer chunk missing or stale')
  for (const name of ['tiny-worlds.glb', 'painted-material.jpg']) {
    const response = await fetchCurrent('/pongapp/art/' + name)
    invariant(response.ok, `${name} returned ${response.status}`)
    const served = Buffer.from(await response.arrayBuffer())
    const expected = readFileSync(new URL('../apps/web/public/art/' + name, import.meta.url))
    const hash = bytes => createHash('sha256').update(bytes).digest('hex')
    invariant(hash(served) === hash(expected), `${name} does not match this release`)
  }

  const workerResponse = await fetchCurrent('/pongapp/sw.js')
  invariant(workerResponse.ok, `Service-worker retirement script returned ${workerResponse.status}`)
  const worker = await workerResponse.text()
  invariant(worker.includes('registration.unregister()'), 'Stale-shell retirement worker was not deployed')

  const healthResponse = await fetch(new URL('/api/health', roomServerUrl), { cache: 'no-store' })
  invariant(healthResponse.ok, `Room health returned ${healthResponse.status}`)
  const health = await healthResponse.json()
  invariant(health.protocol === 7, `Room server protocol was ${health.protocol}, expected 7`)
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
