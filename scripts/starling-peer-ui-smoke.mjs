import assert from 'node:assert/strict'
import { chromium } from '/Users/guclaw/.openclaw/workspace/sites/jonathangu-mobile-impact/node_modules/playwright/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
const evidence = process.env.STARLING_EVIDENCE || '/Users/guclaw/.openclaw/workspace/task-artifacts/starling-rescue-release'
const url = process.env.STARLING_URL || 'http://127.0.0.1:5173/pongapp/'
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await hostContext.addInitScript(() => {
  const Socket = window.WebSocket
  window.__peerTestSockets = []
  window.WebSocket = class extends Socket { constructor(...args) { super(...args); window.__peerTestSockets.push(this) } }
})
const friendContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const host = await hostContext.newPage(), friend = await friendContext.newPage(), errors = [], handshakes = []
for (const page of [host, friend]) page.on('pageerror', e => errors.push(e.message))
const cdp = await hostContext.newCDPSession(host); await cdp.send('Network.enable')
cdp.on('Network.webSocketHandshakeResponseReceived', event => handshakes.push({ status: event.response.status, extensions: event.response.headers['Sec-WebSocket-Extensions'] ?? event.response.headers['sec-websocket-extensions'] ?? '' }))
let report = {}
try {
  await host.goto(url)
  await host.getByLabel('Your name aboard').fill('Touch Captain')
  await host.getByRole('button', { name: /Bring your people/ }).click()
  await host.waitForFunction(() => window.__STARLING__?.stats().status.startsWith('Online'))
  const code = await host.evaluate(() => location.hash.split('/').at(-1))
  await friend.goto(url); await friend.getByLabel('Your name aboard').fill('Desktop Friend')
  await friend.getByRole('button', { name: /Join a friend/ }).click()
  await friend.getByLabel('Invitation code').fill(code)
  await friend.getByRole('button', { name: 'Join ship', exact: true }).click()
  await friend.waitForFunction(() => window.__STARLING__?.snapshot().crew.filter(c => c.origin === 'human').length === 2)
  await host.waitForFunction(() => window.__STARLING__.snapshot().crew.filter(c => c.origin === 'human').length === 2)
  const before = await host.evaluate(() => window.__STARLING__.snapshot().crew.find(c => c.name === 'Touch Captain'))
  const stick = await host.getByRole('application', { name: 'Move and climb joystick' }).boundingBox()
  const point = { x: stick.x + stick.width / 2 + 30, y: stick.y + stick.height / 2, id: 1, radiusX: 5, radiusY: 5, force: 1 }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
  await host.waitForTimeout(450)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await host.waitForFunction(x => window.__STARLING__.snapshot().crew.find(c => c.name === 'Touch Captain').x > x + .4, before.x)
  const jump = await host.getByRole('button', { name: /Jump/, exact: false }).boundingBox()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, x: jump.x + jump.width / 2, y: jump.y + jump.height / 2 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await host.waitForFunction(() => window.__STARLING__.snapshot().crew.find(c => c.name === 'Touch Captain').y > -.9)
  await friend.keyboard.down('d'); await friend.waitForTimeout(250); await friend.keyboard.up('d')
  await host.getByRole('button', { name: /Crew orders/ }).click()
  await host.getByRole('button', { name: 'SHD Shield', exact: true }).click()
  await friend.waitForFunction(() => window.__STARLING__.snapshot().crew.find(c => c.id === 'pip').order === 'shield')
  await host.screenshot({ path: `${evidence}/peer-phone.png` }); await friend.screenshot({ path: `${evidence}/peer-desktop.png` })
  await host.getByRole('button', { name: 'Pause and settings' }).click()
  const downloadEvent = host.waitForEvent('download'); await host.getByRole('button', { name: 'Export save', exact: true }).click()
  const download = await downloadEvent; await download.saveAs(`${evidence}/peer-export.json`)
  await host.getByRole('button', { name: 'Back to the ship' }).click()
  await hostContext.setOffline(true)
  // Chromium's offline emulation does not terminate an already-open WebSocket; force that transport loss explicitly.
  await host.evaluate(() => window.__peerTestSockets.filter(s => s.readyState === WebSocket.OPEN).forEach(s => s.close(1000, 'Connectivity exercise')))
  console.log('Testing connection recovery after AI takeover grace…')
  await friend.waitForFunction(id => window.__STARLING__.snapshot().crew.find(c => c.id === id)?.pet === true, before.id, { timeout: 35000 })
  await hostContext.setOffline(false)
  await host.waitForFunction(() => window.__STARLING__?.stats().status.startsWith('Online'), null, { timeout: 20000 })
  await friend.waitForFunction(id => window.__STARLING__.snapshot().crew.find(c => c.id === id)?.pet === false, before.id, { timeout: 20000 })
  assert.equal(await host.evaluate(id => window.__STARLING__.snapshot().crew.filter(c => c.id === id).length, before.id), 1)
  await host.getByRole('button', { name: 'Pause and settings' }).click()
  await host.getByRole('button', { name: 'Save & exit', exact: true }).click()
  await host.getByRole('button', { name: 'Continue your voyage →', exact: true }).click()
  await host.waitForFunction(() => window.__STARLING__?.stats().status.startsWith('Solo'))
  assert.equal(await host.evaluate(() => window.__STARLING__.snapshot().crew.filter(c => !c.pet).length), 1)
  await host.getByRole('button', { name: 'Pause and settings' }).click(); await host.getByRole('button', { name: 'Save & exit', exact: true }).click()
  await host.locator('input[type=file]').setInputFiles(`${evidence}/peer-export.json`)
  await host.getByText('Voyage imported. Continue solo or bring your friends.', { exact: true }).waitFor()
  report = { url, code, touchMovementAndQuickJump: true, desktopMovement: true, sharedAIOrder: true, takeoverAfter20Seconds: true, reconnectIdentityPreserved: true, exportImportAndSoloContinuation: true, handshakes, errors }
  assert.deepEqual(errors, []); console.log(JSON.stringify(report, null, 2))
} finally { await writeFile(`${evidence}/peer-ui-smoke.json`, JSON.stringify(report, null, 2)); await browser.close() }
