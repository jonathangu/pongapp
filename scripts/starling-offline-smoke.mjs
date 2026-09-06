import { chromium } from '/Users/guclaw/.openclaw/workspace/sites/jonathangu-mobile-impact/node_modules/playwright/index.mjs'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const dist = fileURLToPath(new URL('../apps/web/dist/', import.meta.url)), evidence = process.env.STARLING_EVIDENCE || '/Users/guclaw/.openclaw/workspace/task-artifacts/starling-rescue-release'
const original = JSON.parse(await readFile(join(dist, 'starling-pack.json'), 'utf8'))
const originalHtml = await readFile(join(dist, 'index.html'), 'utf8'), entry = originalHtml.match(/src="\/pongapp\/(assets\/index-[^"]+\.js)"/)[1]
const newEntry = 'assets/index-test-next.js', newHtml = originalHtml.replace(entry, newEntry) + '\n<!-- offline update verifier -->'
const sha = body => createHash('sha256').update(body).digest('hex')
const updated = structuredClone(original)
updated.files = updated.files.map(file => file.url === '/pongapp/' ? { ...file, bytes: Buffer.byteLength(newHtml), sha256: sha(newHtml) } : file.url === '/pongapp/' + entry ? { ...file, url: '/pongapp/' + newEntry } : file)
updated.bytes = updated.files.reduce((n, f) => n + f.bytes, 0); updated.version = sha(JSON.stringify(updated.files)).slice(0, 20)
let scenario = 'clean'
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname
  if (!path.startsWith('/pongapp/') || path.includes('..')) { res.writeHead(404); res.end(); return }
  const relative = path.slice('/pongapp/'.length) || 'index.html'
  try {
    if (scenario === 'slow' && relative !== 'starling-pack.json') await new Promise(resolve => setTimeout(resolve, 150))
    let body
    if (relative === 'starling-pack.json') body = JSON.stringify(scenario === 'clean' ? original : updated)
    else if (relative === 'index.html' && scenario !== 'clean') body = newHtml
    else if (relative === 'art/starling/glasswing.webp' && scenario === 'corrupt') body = 'bad image bytes'
    else body = await readFile(join(dist, relative === newEntry ? entry : relative))
    const mime = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' }[extname(relative)] || 'application/octet-stream'
    res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-store' }); res.end(body)
  } catch { res.writeHead(404); res.end() }
})
await new Promise(resolve => server.listen(5978, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true, channel: 'chrome' }), context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message))
const url = 'http://127.0.0.1:5978/pongapp/'
const status = () => page.evaluate(async () => {
  const registration = await navigator.serviceWorker.ready, channel = new MessageChannel()
  return new Promise(resolve => { channel.port1.onmessage = event => { channel.port1.close(); resolve(event.data) }; registration.active.postMessage({ type: 'starling-status' }, [channel.port2]) })
})
const refresh = async () => { await page.goto(url); await page.waitForFunction(() => navigator.serviceWorker.controller); await page.getByRole('heading', { name: 'Make room on your home screen.' }).scrollIntoViewIfNeeded() }
const report = {}
try {
  await refresh(); await page.getByRole('button', { name: /Download offline pack/ }).click()
  await page.getByRole('button', { name: '✓ Offline pack ready' }).waitFor()
  report.first = await status(); assert.equal(report.first.ready, true); assert.equal(report.first.version, original.version)
  scenario = 'corrupt'; await refresh(); await page.getByRole('button', { name: 'Download updated pack' }).click()
  await page.getByText('A game update arrived during download. Try again to get one complete matching version.', { exact: true }).waitFor()
  report.corruptPreserved = await status(); assert.equal(report.corruptPreserved.version, original.version); assert.equal(report.corruptPreserved.ready, true)
  scenario = 'slow'; await refresh(); await page.getByRole('button', { name: 'Download updated pack' }).click(); await page.getByRole('button', { name: 'Cancel download' }).click()
  await page.getByText('Download cancelled. Your previous pack is unchanged.', { exact: true }).waitFor()
  report.cancelPreserved = await status(); assert.equal(report.cancelPreserved.version, original.version)
  scenario = 'updated'; await refresh(); await page.getByRole('button', { name: 'Download updated pack' }).click(); await page.getByRole('button', { name: '✓ Offline pack ready' }).waitFor()
  report.updated = await status(); assert.equal(report.updated.version, updated.version)
  await context.setOffline(true); await page.reload(); await page.getByRole('button', { name: /Set sail/ }).click()
  await page.waitForFunction(() => window.__STARLING__?.stats().hullAssetLoaded)
  await page.waitForTimeout(1500); report.offlineGame = await page.evaluate(() => ({ tick: window.__STARLING__.snapshot().tick, ...window.__STARLING__.stats() })); assert.ok(report.offlineGame.tick > 30)
  report.oldHashAvailable = await page.evaluate(async path => (await fetch(path)).ok, '/pongapp/' + entry); assert.equal(report.oldHashAvailable, true)
  await page.screenshot({ path: evidence + '/offline-phone-game.png' })
  await page.evaluate(async () => { const meta = await caches.open('starling-meta-v1'), active = await (await meta.match(new URL('/pongapp/__starling_active__', location.origin))).json(); await (await caches.open(active.cache)).delete(new URL('/pongapp/art/starling/glasswing.webp', location.origin).href) })
  report.evictionDetected = await status(); assert.equal(report.evictionDetected.ready, false); assert.equal(report.evictionDetected.reason, 'evicted')
  await context.setOffline(false); await refresh(); await page.getByRole('button', { name: /Download offline pack/ }).click(); await page.getByRole('button', { name: '✓ Offline pack ready' }).waitFor()
  report.repaired = await status(); assert.equal(report.repaired.ready, true)
  report.errors = errors; assert.deepEqual(errors, [])
  await writeFile(evidence + '/offline-smoke.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2))
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
