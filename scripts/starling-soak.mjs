import assert from 'node:assert/strict'
import { chromium } from '/Users/guclaw/.openclaw/workspace/sites/jonathangu-mobile-impact/node_modules/playwright/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
const evidence = process.env.STARLING_EVIDENCE || '/Users/guclaw/.openclaw/workspace/task-artifacts/starling-rescue-release'
const duration = Number(process.env.STARLING_SOAK_SECONDS || 600)
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome' }), context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
const page = await context.newPage(), errors = [], samples = [], started = Date.now()
page.on('pageerror', e => errors.push(e.message))
try {
  await page.goto('http://127.0.0.1:5173/pongapp/'); await page.getByRole('button', { name: /Set sail/ }).click()
  await page.waitForFunction(() => window.__STARLING__?.dev && window.__STARLING__.stats().hullAssetLoaded)
  await page.keyboard.press('d')
  await page.evaluate(async () => {
    const core = await import('/pongapp/@fs/Users/guclaw/.openclaw/workspace/pongapp/packages/game-core/src/rescue/index.ts')
    window.soakCore = core
    // Stress fixture only: periodic repairs keep combat running for the entire wall-clock soak.
    window.soakTimer = setInterval(() => {
      const d = window.__STARLING__.dev, s = d.session.state
      s.ship.hp = s.ship.maxHp
      if (s.phase !== 'playing') { d.session.state = core.restartRescueGame(s); d.session.authoritative = d.session.state }
      const p = d.session.state.crew[0], input = core.routeRescueCrew(p, 'east', d.session.state.tick, 1 / 60)
      if (p.seat === 'east') { d.controls.buttons = core.RESCUE_BUTTON.fire; d.controls.x = Math.cos(s.time); d.controls.y = Math.sin(s.time) }
      else { d.controls.x = input.x; d.controls.y = input.y; d.controls.buttons = input.buttons }
    }, 16)
  })
  let nextRestart = 90
  while ((Date.now() - started) / 1000 < duration) {
    await page.waitForTimeout(15000)
    const seconds = Math.round((Date.now() - started) / 1000)
    const sample = await page.evaluate(() => ({ ...window.__STARLING__.stats(), tick: window.__STARLING__.snapshot().tick, time: window.__STARLING__.snapshot().time, heap: performance.memory?.usedJSHeapSize }))
    samples.push({ seconds, ...sample }); console.log('soak', seconds, 'sec', sample.frameP95Ms.toFixed(1), 'ms', sample.geometries, 'geometries', sample.effects, 'effects')
    if (seconds >= nextRestart) {
      nextRestart += 90
      await page.evaluate(() => {
        const d = window.__STARLING__.dev, c = window.soakCore
        const next = c.restartRescueGame(d.session.state, true)
        next.region = ['sea', 'jungle', 'space'][next.biome]; next.docks = c.makeRescueDocks(next.region)
        d.session.state = next; d.session.authoritative = next; d.controls.clear()
      })
    }
  }
  assert.deepEqual(errors, [])
  assert.ok(samples.every(s => s.frameP95Ms < 40), 'Frame budget exceeded in headless Mac soak')
  assert.ok(Math.max(...samples.map(s => s.geometries)) < 1800, 'Geometry count grew without bound')
  assert.ok(Math.max(...samples.map(s => s.textures)) < 100, 'Texture count grew without bound')
  assert.ok(samples.every(s => s.audio.voices < 100), 'Audio voices leaked')
  // Fast lifecycle stress: 1200 simulated seconds, save/resume every 10s, 40 resets.
  const simulation = await page.evaluate(() => {
    const c = window.soakCore; let s = c.createRescueGame({ seed: 9123 }), restores = 0, resets = 0
    for (let i = 0; i < 72000; i++) {
      s.ship.hp = s.ship.maxHp; s.phase = 'playing'; c.advanceRescueGame(s, {})
      if (i % 600 === 0) { s = c.resumeRescueSolo(c.decodeRescueSave(c.encodeRescueSave(s))); restores++ }
      if (i > 0 && i % 1800 === 0) { s = c.restartRescueGame(s, true); resets++ }
    }
    return { simulatedSeconds: 1200, restores, resets, finalSaveBytes: c.encodeRescueSave(s).length }
  })
  await page.screenshot({ path: `${evidence}/soak-final-phone.png` })
  const report = { wallClockSeconds: (Date.now() - started) / 1000, fixture: 'Periodic repairs and biome resets; not natural player survival', errors, samples, simulation }
  await writeFile(`${evidence}/soak.json`, JSON.stringify(report, null, 2)); console.log('SOAK PASSED', JSON.stringify({ duration, simulation }))
} finally { await browser.close() }
