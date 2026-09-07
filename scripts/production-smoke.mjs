import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const site = new URL(process.env.PONGAPP_SITE_URL || 'https://www.jonathangu.com/pongapp/')
const server = process.env.ROOM_SERVER_URL || 'https://pongapp-room.pongapp-room-worker.workers.dev'
const revision = process.env.DEPLOYMENT_ID
async function current(path) { const url = new URL(path, site); url.searchParams.set('deploy', revision || Date.now()); return fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) }) }
async function verify() {
  const page = await current(site.pathname); assert.equal(page.status, 200)
  const html = await page.text(); assert.ok(html.includes('Starling — A little closer to home'))
  const path = html.match(/src="(\/pongapp\/assets\/index-[^"]+\.js)"/)?.[1]; assert.ok(path)
  const scriptResponse = await current(path); assert.equal(scriptResponse.status, 200)
  const script = await scriptResponse.text()
  for (const marker of ['A little closer to home.', 'Play together', 'Make a line of 3.', 'starling.puzzle.v1', 'Luma cheers you on!', server]) assert.ok(script.includes(marker), 'Missing puzzle marker: ' + marker)
  for (const retired of ['__STARLING_BRIDGE__', 'godot/index.html', 'Required phone installation', 'galley.glb']) assert.ok(!script.includes(retired), 'Retired client remains: ' + retired)
  assert.ok(Buffer.byteLength(script) < 350000, 'Initial JavaScript exceeds 350 KB')
  const worker = await current('/pongapp/sw.js'); assert.equal(await worker.text(), readFileSync(new URL('../apps/web/public/sw.js', import.meta.url), 'utf8'))
  const manifestResponse = await current('/pongapp/starling-pack.json'); assert.equal(manifestResponse.status, 200)
  const pack = await manifestResponse.json(); assert.equal(pack.format, 'starling-pack-v1'); assert.ok(pack.files.length >= 8 && pack.bytes < 3000000)
  assert.ok(pack.files.some(file => file.url === path)); assert.ok(!pack.files.some(file => /godot|\.m4a$|\.wasm$|\.pck$/.test(file.url)))
  if (revision) assert.equal(pack.revision, revision)
  for (let i = 0; i < pack.files.length; i += 5) await Promise.all(pack.files.slice(i, i + 5).map(async file => {
    const response = await current(file.url), bytes = Buffer.from(await response.arrayBuffer()); assert.equal(response.status, 200); assert.equal(bytes.length, file.bytes, file.url); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.url)
  }))
  const health = await (await fetch(server + '/api/health')).json(); assert.equal(health.protocol, 10); assert.equal(health.rescueProtocol, 1); assert.equal(health.puzzleProtocol, 1); assert.equal(health.runtime, 'cloudflare-durable-objects')
  console.log(JSON.stringify({ test: 'production-smoke', result: 'passed', site: site.href, revision: pack.revision, javascriptBytes: Buffer.byteLength(script), offlineBytes: pack.bytes, verifiedFiles: pack.files.length }))
}
for (let attempt = 1; ; attempt++) {
  try { await verify(); break } catch (error) { if (attempt >= 12) throw error; await new Promise(resolve => setTimeout(resolve, 5000)) }
}
