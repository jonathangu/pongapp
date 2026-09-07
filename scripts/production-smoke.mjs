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
  for (const text of ['godot/index.html', 'Auto aim · auto fire', 'Walking to ', 'Play together', 'starling-pack.json', '__STARLING_BRIDGE__', 'Three hearts. One stolen ship.', 'Replay guided practice', 'Turn music off', 'Required phone installation']) {
    invariant(script.includes(text), `PongApp bundle is missing Starling release marker: ${text}`)
  }
  invariant(!script.includes('galley.glb') && !script.includes('Classic voyages'), 'The previous gameplay client is still in the main bundle')
  const engineResponse = await fetchCurrent('/pongapp/godot/index.html')
  const engine = await engineResponse.text()
  invariant(engineResponse.ok && engine.includes('GODOT_CONFIG') && engine.includes('index.pck'), 'The playable Godot export is missing')
  const wasmResponse = await fetchCurrent('/pongapp/godot/index.wasm')
  invariant(wasmResponse.ok && /application\/wasm/.test(wasmResponse.headers.get('content-type') ?? ''), 'Godot WebAssembly has the wrong response or MIME type')
  const wasm = Buffer.from(await wasmResponse.arrayBuffer())
  invariant(wasm.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109])) && wasm.length > 1000000, 'The Godot engine is not a valid WebAssembly artifact')

  const workerResponse = await fetchCurrent('/pongapp/sw.js')
  invariant(workerResponse.ok, `Offline service worker returned ${workerResponse.status}`)
  const worker = await workerResponse.text()
  const expectedWorker = readFileSync(new URL('../apps/web/public/sw.js', import.meta.url), 'utf8')
  invariant(worker === expectedWorker, 'Atomic offline worker does not match this release')
  const packResponse = await fetchCurrent('/pongapp/starling-pack.json')
  invariant(packResponse.ok, 'Offline pack manifest is missing')
  const pack = await packResponse.json()
  invariant(pack.format === 'starling-pack-v1' && pack.files.length >= 25, 'Offline pack is incomplete')
  for (const track of ['tides-of-the-old-world', 'each-way-i-turn', 'tide-rope', 'saltwake-run', 'moonshot-fever', 'tiger-map', 'three-hearts']) invariant(pack.files.some(file => file.url.includes('/assets/' + track + '-') && file.url.endsWith('.m4a')), `Offline pack omits ${track}`)
  for (const name of ['index.html', 'index.js', 'index.pck', 'index.wasm', 'index.audio.worklet.js', 'index.audio.position.worklet.js']) {
    invariant(pack.files.some(file => file.url === '/pongapp/godot/' + name), `Offline pack omits Godot ${name}`)
  }
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
