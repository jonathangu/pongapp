import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const url = process.env.GODOT_SITE_URL || 'http://127.0.0.1:5173/pongapp/'
const evidence = resolve(process.env.GODOT_EVIDENCE || 'artifacts/godot-browser')
const offline = process.env.GODOT_OFFLINE === '1'
const report = { url, at: new Date().toISOString(), runtimeSession: '01a0369d-0914-7190-ac0e-b4d37e1fc052', viewports: [], controls: {}, coOp: {}, offline: null, errors: [] }
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const activeContexts = []
async function context(viewport) {
  const value = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  activeContexts.push(value)
  return value
}
function observe(page, label) {
  page.on('pageerror', error => report.errors.push({ label, kind: 'page', message: error.message }))
  page.on('console', message => { if (message.type() === 'error') report.errors.push({ label, kind: 'console', message: message.text() }) })
}
async function start(page, name, online = false) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.locator('.g-player-name input').fill(name)
  await page.getByRole('button', { name: online ? /Play together/ : /Play solo/ }).click()
  await ready(page)
  if (await page.locator('[data-story-choice="wind"]').count()) {
    await page.locator('[data-story-choice="wind"]').click()
    await page.locator('[data-story-continue="watch"]').click()
  }
}
async function ready(page) {
  await page.waitForFunction(() => window.__STARLING__?.stats().frames > 90, null, { timeout: 45000 })
  assert.match(await page.evaluate(() => window.__STARLING__.stats().engine), /^Godot 4\.7\.2/)
}
async function waitSeat(page, name, seat) {
  await page.waitForFunction(({ name, seat }) => window.__STARLING__?.snapshot().crew.find(c => c.name === name && !c.pet)?.seat === seat, { name, seat }, { timeout: 15000 })
}
const snapshot = page => page.evaluate(() => window.__STARLING__.snapshot())
const stats = page => page.evaluate(() => window.__STARLING__.stats())
const shot = (page, name) => page.screenshot({ path: resolve(evidence, name + '.png') })
try {
  console.log('Godot smoke: phone controls and station routing')
  const soloContext = await context({ width: 390, height: 844 }), page = await soloContext.newPage()
  observe(page, 'solo')
  await page.goto(url)
  await page.screenshot({ path: resolve(evidence, 'home-phone.png'), fullPage: true })
  await start(page, 'Solo Proof')
  await waitSeat(page, 'Solo Proof', 'engine')
  const opening = await snapshot(page)
  assert.equal(opening.rulesetVersion, 13)
  await shot(page, 'play-phone')
  const view = await stats(page)
  assert.ok(view.visibleWorldWidth >= 45 && view.visibleWorldWidth <= 55)
  report.viewports.push({ width: 390, height: 844, ...view })
  const stick = page.getByRole('application', { name: 'Steering joystick' })
  const box = await stick.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 37, box.y + box.height / 2 - 20)
  await page.waitForTimeout(1800)
  await page.mouse.up()
  const moved = await snapshot(page)
  assert.ok(Math.hypot(moved.ship.x - opening.ship.x, moved.ship.y - opening.ship.y) > 5, 'Joystick did not steer the ship')
  await page.waitForTimeout(1000)
  const stopped = await snapshot(page)
  assert.ok(Math.hypot(stopped.ship.vx, stopped.ship.vy) < .1, 'Helm did not brake')
  report.controls.joystickTravel = Math.hypot(moved.ship.x - opening.ship.x, moved.ship.y - opening.ship.y)
  report.controls.brakeSpeed = Math.hypot(stopped.ship.vx, stopped.ship.vy)
  await page.getByRole('button', { name: 'Shield', exact: true }).click()
  await waitSeat(page, 'Solo Proof', 'shield')
  await page.getByRole('button', { name: 'Cook', exact: true }).click()
  await waitSeat(page, 'Solo Proof', 'galley')
  await page.waitForFunction(() => window.__STARLING__.snapshot().meal.remaining > 0, null, { timeout: 7000 })
  report.controls.autoCook = true
  await page.getByRole('button', { name: 'Cannons', exact: true }).click()
  await page.waitForFunction(() => window.__STARLING__.snapshot().crew.find(c => c.name === 'Solo Proof')?.seat?.match(/east|north|west|south|starburst/), null, { timeout: 15000 })
  const guns = await snapshot(page)
  report.controls.automaticShots = guns.stats.shots
  assert.ok(guns.stats.shots > 0)
  await page.getByRole('button', { name: 'Deck', exact: true }).click()
  await shot(page, 'live-deck-phone')
  await page.getByRole('button', { name: 'Close deck' }).click()
  await page.getByRole('button', { name: 'Open world map' }).click()
  await page.waitForFunction(() => window.__STARLING__.stats().visibleWorldWidth > 115)
  const map = await stats(page)
  assert.ok(map.visibleWorldWidth > 115)
  await shot(page, 'world-map-phone')
  await page.getByRole('button', { name: 'Close world map' }).click()
  await page.getByRole('button', { name: 'Pause and settings' }).click()
  await page.waitForTimeout(200)
  const pausedState = await snapshot(page), pausedTime = pausedState.time
  await page.waitForTimeout(650)
  assert.equal((await snapshot(page)).time, pausedTime)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export voyage save' }).click()
  const download = await downloadPromise
  await download.saveAs(resolve(evidence, 'verified-voyage.json'))
  report.controls.pausedAndExported = true
  report.controls.audio = (await stats(page)).audio
  assert.equal(report.controls.audio.state, 'running')
  await page.getByRole('button', { name: 'Save & return home' }).click()
  const homeSave = await page.evaluate(() => JSON.parse(localStorage.getItem('starling-rescue.save.v2')).state)
  assert.equal(homeSave.tick, pausedState.tick, 'Returning home did not save the current tick')
  await page.getByRole('button', { name: /Continue your voyage/ }).click()
  await page.waitForFunction(() => Boolean(window.__STARLING__))
  const firstResumed = await snapshot(page)
  assert.ok(firstResumed.tick >= pausedState.tick, 'Continue loaded an older autosave')
  await ready(page)
  assert.ok((await snapshot(page)).time >= pausedTime)
  report.controls.resumed = true
  report.controls.saveResume = { pausedTick: pausedState.tick, savedTick: homeSave.tick, firstResumedTick: firstResumed.tick, pausedTime, firstResumedTime: firstResumed.time }
  await soloContext.close()

  for (const viewport of [{ width: 320, height: 740 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }]) {
    console.log('Godot smoke: viewport', viewport.width, viewport.height)
    const current = await context(viewport), tab = await current.newPage()
    observe(tab, 'viewport-' + viewport.width)
    await start(tab, 'Viewport Proof')
    await waitSeat(tab, 'Viewport Proof', 'engine')
    assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    const metrics = await stats(tab)
    assert.ok(metrics.visibleWorldWidth >= (viewport.width === 844 ? 100 : viewport.width === 1440 ? 70 : 45))
    report.viewports.push({ ...viewport, ...metrics })
    await shot(tab, 'play-' + viewport.width + 'x' + viewport.height)
    await current.close()
  }

  console.log('Godot smoke: two independent online browsers and reconnect')
  const hostContext = await context({ width: 1440, height: 1000 }), host = await hostContext.newPage()
  observe(host, 'host')
  // Ensure cached engine startup precedes room creation: station commands must use
  // the authoritative welcome identity, never the temporary solo placeholder.
  await host.route('**/api/rescue/rooms', async route => {
    await new Promise(resolve => setTimeout(resolve, 8000))
    await route.continue()
  })
  await start(host, 'Captain Proof', true)
  await waitSeat(host, 'Captain Proof', 'engine')
  const invite = await host.getByRole('button', { name: /Invite ·/ }).innerText()
  const code = invite.match(/[A-Z2-9]{6}/)?.[0]
  assert.ok(code)
  const guestContext = await context({ width: 390, height: 844 }), guest = await guestContext.newPage()
  observe(guest, 'guest')
  await guest.goto(url)
  await guest.locator('.g-player-name input').fill('Crew Proof')
  await guest.goto(url + '#/rescue/' + code)
  await guest.reload()
  await ready(guest)
  await waitSeat(guest, 'Crew Proof', 'east')
  const guestId = (await snapshot(guest)).crew.find(c => c.name === 'Crew Proof').id
  const before = await snapshot(host)
  await host.keyboard.down('KeyD')
  await host.waitForTimeout(1100)
  await host.keyboard.up('KeyD')
  await host.waitForTimeout(900)
  const after = await snapshot(host), peer = await snapshot(guest)
  assert.ok(after.ship.x > before.ship.x + 3, 'Host keyboard steering failed')
  assert.ok(Math.hypot(peer.ship.x - after.ship.x, peer.ship.y - after.ship.y) < 1, 'Clients disagree on the authoritative ship')
  await shot(host, 'coop-host')
  await shot(guest, 'coop-phone')
  await guest.getByRole('button', { name: 'Helm', exact: true }).click()
  await guest.waitForTimeout(400)
  assert.equal((await snapshot(guest)).crew.find(c => c.id === guestId).seat, 'east', 'Guest stole human helm')
  await guestContext.setOffline(true)
  await guest.evaluate(() => dispatchEvent(new Event('offline')))
  await host.waitForTimeout(900)
  await guestContext.setOffline(false)
  await guest.evaluate(() => dispatchEvent(new Event('online')))
  await guest.waitForFunction(() => window.__STARLING__.stats().connected && window.__STARLING__.stats().status.startsWith('Online'), null, { timeout: 20000 })
  const restored = await snapshot(guest)
  assert.equal(restored.crew.filter(c => c.id === guestId).length, 1)
  assert.equal(restored.crew.find(c => c.name === 'Crew Proof').id, guestId)
  report.coOp = { roomCode: code, hostPlayer: after.crew.find(c => c.name === 'Captain Proof').id, guestPlayer: guestId, uniqueHumans: restored.crew.filter(c => !c.pet).length, sameIdAfterReconnect: true, humanSeatProtected: true, divergence: Math.hypot(peer.ship.x - after.ship.x, peer.ship.y - after.ship.y), host: await stats(host), guest: await stats(guest) }
  await guestContext.close(); await hostContext.close()

  if (offline) {
    console.log('Godot smoke: verified pack and cold offline engine startup')
    const offlineContext = await context({ width: 390, height: 844 }), tab = await offlineContext.newPage()
    await tab.goto(url)
    await tab.locator('.g-offline summary').click()
    await tab.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 })
    await tab.getByRole('button', { name: /Download offline pack/ }).click()
    await tab.getByRole('button', { name: '✓ Offline pack ready', exact: true }).waitFor({ timeout: 180000 })
    await offlineContext.setOffline(true)
    await tab.reload({ waitUntil: 'domcontentloaded' })
    await tab.getByRole('button', { name: /Play solo/ }).click()
    await ready(tab)
    await shot(tab, 'cold-offline-godot')
    report.offline = { coldStartup: true, engine: (await stats(tab)).engine, frames: (await stats(tab)).frames }
    await offlineContext.close()
  }
  assert.deepEqual(report.errors, [])
  report.passed = true
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.passed = false; report.failure = error.stack
  for (const [index, current] of activeContexts.entries()) for (const page of current.pages()) {
    try { await shot(page, 'failure-' + index); report['failureState' + index] = { state: await snapshot(page), stats: await stats(page) } } catch { /* retain available evidence */ }
  }
  throw error
} finally {
  await writeFile(resolve(evidence, 'browser-smoke.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
