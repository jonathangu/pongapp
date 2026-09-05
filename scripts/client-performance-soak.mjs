import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const baseUrl = process.env.UI_URL ?? 'http://127.0.0.1:4173/pongapp/'
const mode = process.env.PERF_MODE === 'online' ? 'online' : 'solo'
const roomServerUrl = process.env.ROOM_SERVER_URL ?? 'https://pongapp-room.pongapp-room-worker.workers.dev'
const durationMs = Math.max(5_000, Math.min(120_000, Number(process.env.PERF_DURATION_MS ?? 20_000)))
const cpuRate = Math.max(1, Math.min(20, Number(process.env.PERF_CPU_RATE ?? 4)))
const networkDropMs = Math.max(0, Math.min(10_000, Number(process.env.PERF_NETWORK_DROP_MS ?? 0)))
const profile = await mkdtemp(join(tmpdir(), 'pongapp-client-soak-'))
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-background-networking', '--disable-default-apps',
  '--disable-extensions', '--disable-sync', '--no-first-run', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] })

const browserUrl = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Chrome DevTools did not start.')), 15_000)
  chrome.stderr.setEncoding('utf8')
  chrome.stderr.on('data', (chunk) => {
    const match = chunk.match(/DevTools listening on (ws:\/\/[^\s]+)/)
    if (!match) return
    clearTimeout(timer)
    resolve(match[1])
  })
  chrome.once('exit', (code) => reject(new Error(`Chrome exited early (${code}).`)))
})

const socket = new WebSocket(browserUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let serial = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data))
  const waiter = pending.get(message.id)
  if (!waiter) return
  pending.delete(message.id)
  if (message.error) waiter.reject(new Error(message.error.message))
  else waiter.resolve(message.result)
})

function send(method, params = {}, sessionId) {
  serial += 1
  return new Promise((resolve, reject) => {
    pending.set(serial, { resolve, reject })
    socket.send(JSON.stringify({ id: serial, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
}

function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)) }
async function evaluate(sessionId, expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Browser evaluation failed.')
  return result.result?.value
}
function metricsByName(result) { return Object.fromEntries(result.metrics.map(({ name, value }) => [name, value])) }

let sessionId
let peerSocket
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  ;({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }))
  await send('Page.enable', {}, sessionId)
  await send('Network.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)
  await send('Performance.enable', {}, sessionId)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }, sessionId)
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 }, sessionId)
  await send('Emulation.setCPUThrottlingRate', { rate: cpuRate }, sessionId)
  let targetUrl = baseUrl
  if (mode === 'online') {
    const response = await fetch(new URL('/api/rooms', roomServerUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: new URL(baseUrl).origin },
      body: JSON.stringify({ hostName: 'Perf Host', roomName: 'Client Soak', mode: 'coop' }),
    })
    if (!response.ok) throw new Error(`Could not create an online soak room (${response.status}).`)
    const { roomCode } = await response.json()
    targetUrl = new URL(`?quick=1#/room/${roomCode}`, baseUrl).toString()
  }
  await send('Page.navigate', { url: targetUrl }, sessionId)
  await sleep(2_000)
  if (mode === 'solo') {
    await evaluate(sessionId, `[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Solo Adventure'))?.click()`)
  } else {
    const roomCode = new URL(targetUrl).hash.split('/').at(-1)
    const peerUrl = new URL(`/api/rooms/${roomCode}/websocket`, roomServerUrl)
    peerUrl.protocol = peerUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    peerSocket = new WebSocket(peerUrl)
    await new Promise((resolve, reject) => {
      peerSocket.addEventListener('open', resolve, { once: true })
      peerSocket.addEventListener('error', reject, { once: true })
    })
    peerSocket.send(JSON.stringify({
      type: 'hello', version: 5, guestId: `perf-peer-${crypto.randomUUID()}`,
      displayName: 'Perf Peer', role: 'player', clientSessionId: crypto.randomUUID(), reconnectAttempt: 0,
    }))
  }
  await sleep(3_800)
  const before = metricsByName(await send('Performance.getMetrics', {}, sessionId))
  await evaluate(sessionId, `(() => {
    const sample = globalThis.__pongClientSoak = { gaps: [], longTasks: [], startedAt: performance.now() }
    let previous = performance.now()
    const frame = (now) => { sample.gaps.push(now - previous); previous = now; sample.frame = requestAnimationFrame(frame) }
    sample.frame = requestAnimationFrame(frame)
    try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) sample.longTasks.push(entry.duration) }).observe({ type: 'longtask', buffered: true }) } catch {}
  })()`)
  const bounds = await evaluate(sessionId, `(() => { const rect = document.querySelector('.river-paddle')?.getBoundingClientRect(); return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null })()`)
  if (!bounds) throw new Error('The river controls did not mount.')
  const startedAt = Date.now()
  let step = 0
  let networkDropComplete = false
  while (Date.now() - startedAt < durationMs) {
    if (!networkDropComplete && networkDropMs > 0 && Date.now() - startedAt >= durationMs * 0.35) {
      networkDropComplete = true
      await send('Network.emulateNetworkConditions', {
        offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
      }, sessionId)
      await sleep(networkDropMs)
      await send('Network.emulateNetworkConditions', {
        offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
      }, sessionId)
    }
    const x = bounds.left + bounds.width * 0.5
    const y = bounds.top + bounds.height * 0.5
    await send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x, y, radiusX: 9, radiusY: 9, force: 1 }],
    }, sessionId)
    await sleep(240)
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId)
    step += 1
    await sleep(step % 3 === 0 ? 520 : 260)
  }
  const after = metricsByName(await send('Performance.getMetrics', {}, sessionId))
  const sample = await evaluate(sessionId, `(() => {
    const sample = globalThis.__pongClientSoak
    cancelAnimationFrame(sample.frame)
    const percentile = (values, fraction) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))] ?? 0 }
    return {
      frames: sample.gaps.length,
      frameGapP50Ms: percentile(sample.gaps, 0.5),
      frameGapP95Ms: percentile(sample.gaps, 0.95),
      frameGapP99Ms: percentile(sample.gaps, 0.99),
      maxFrameGapMs: Math.max(0, ...sample.gaps),
      framesOver50Ms: sample.gaps.filter((value) => value > 50).length,
      freezesOver250Ms: sample.gaps.filter((value) => value > 250).length,
      longTasks: sample.longTasks.length,
      longTaskP95Ms: percentile(sample.longTasks, 0.95),
      maxLongTaskMs: Math.max(0, ...sample.longTasks),
    }
  })()`)
  const finalPageState = await evaluate(sessionId, `({
    riverPresent: Boolean(document.querySelector('.river-world')),
    harmonyPresent: Boolean(document.querySelector('.river-harmony')),
    paddlePresent: Boolean(document.querySelector('.river-paddle')),
    connectionError: document.body.textContent?.includes('Connection lost') ?? false,
    blockingOverlayCount: document.querySelectorAll('.river-finish, .room-error').length,
  })`)
  console.log(JSON.stringify({
    url: baseUrl,
    mode,
    mobileViewport: '390x844@3x',
    cpuThrottleRate: cpuRate,
    durationMs,
    networkDropMs,
    ...sample,
    ...finalPageState,
    taskTimeMs: Math.round(((after.TaskDuration ?? 0) - (before.TaskDuration ?? 0)) * 1_000),
    scriptTimeMs: Math.round(((after.ScriptDuration ?? 0) - (before.ScriptDuration ?? 0)) * 1_000),
    heapDeltaKb: Math.round(((after.JSHeapUsedSize ?? 0) - (before.JSHeapUsedSize ?? 0)) / 1_024),
  }, null, 2))
} finally {
  peerSocket?.close(1000, 'soak complete')
  socket.close()
  const chromeExited = chrome.exitCode === null
    ? new Promise((resolve) => chrome.once('exit', resolve))
    : Promise.resolve()
  chrome.kill('SIGTERM')
  await Promise.race([chromeExited, sleep(1_000)])
  if (chrome.exitCode === null) chrome.kill('SIGKILL')
}

// Node's built-in WebSocket can retain its close timer after Chrome is gone.
// Reaching this line means the soak completed and printed its result.
process.exit(0)
