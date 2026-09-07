// Controlled local fixtures verify rendering/UI branches, not campaign difficulty.
// The separate assisted-voyage-room proof wins with normal input packets only.
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
const site = process.env.GODOT_SITE_URL || 'http://127.0.0.1:5173/pongapp/'
const evidence = resolve(process.env.GODOT_EVIDENCE || 'artifacts/godot-features')
const root = resolve(import.meta.dirname, '..')
const coreUrl = new URL('@fs' + resolve(root, 'packages/game-core/src/rescue/index.ts'), site).href
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
const page = await context.newPage(), errors = []
const report = { runtimeSession: '01a0369d-0914-7190-ac0e-b4d37e1fc052', fixtureScope: 'local-only Godot rendering, campaign UI, bounded capacity, loss/retry; no production game-state writes', errors }
await mkdir(evidence, { recursive: true })
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
const snapshot = () => page.evaluate(() => window.__STARLING__.snapshot())
const shot = name => page.screenshot({ path: resolve(evidence, name + '.png') })
async function placeDock(x, y) {
  await page.evaluate(({ x, y }) => { const s = window.__STARLING__.dev.session.state; s.docked = null; s.ship.x = x; s.ship.y = y; s.ship.vx = 0; s.ship.vy = 0 }, { x, y })
  await page.locator('.g-dock-button').click()
  await page.waitForFunction(() => Boolean(window.__STARLING__.snapshot().docked))
}
try {
  await page.goto(site)
  await page.getByRole('button', { name: /Play solo/ }).click()
  await page.waitForFunction(() => window.__STARLING__?.dev && window.__STARLING__.stats().frames > 90)
  await page.evaluate(async url => { window.__FEATURE_CORE__ = await import(url) }, coreUrl)
  console.log('Godot feature: docks, upgrades and regional travel')
  await placeDock(-15, -22)
  await page.getByRole('button', { name: /^hull/ }).click()
  assert.equal((await snapshot()).campaign.upgrades.hull, 1)
  const offers = page.getByRole('button', { name: /^Welcome .* aboard/ })
  if (await offers.count()) await offers.first().click()
  await shot('harbour-upgrade')
  await page.getByRole('button', { name: 'Back to the sea', exact: true }).click()
  await placeDock(37, 33)
  await page.getByRole('button', { name: 'Travel to space →', exact: true }).click()
  await page.waitForFunction(() => window.__STARLING__.snapshot().region === 'space')
  await page.waitForTimeout(800); await shot('high-stars')
  await placeDock(24, -22)
  await page.getByRole('button', { name: 'Travel to sea →', exact: true }).click()
  await page.waitForFunction(() => window.__STARLING__.snapshot().region === 'sea')
  await placeDock(24, -22)
  await page.getByRole('button', { name: 'Travel to jungle →', exact: true }).click()
  await page.waitForFunction(() => window.__STARLING__.snapshot().region === 'jungle')
  await page.waitForTimeout(800); await shot('fernheart-jungle')
  assert.equal((await snapshot()).campaign.upgrades.hull, 1)
  report.regions = ['sea', 'space', 'sea', 'jungle']; report.upgradeRetained = true

  console.log('Godot feature: loss/retry and populated combat rendering')
  await page.evaluate(() => { const s = window.__STARLING__.dev.session.state; s.ship.invulnerable = 0; window.__FEATURE_CORE__.damageRescueShip(s, 100, s.ship.x, s.ship.y) })
  await page.getByRole('button', { name: /Try the voyage again/ }).waitFor()
  await shot('loss')
  await page.getByRole('button', { name: /Try the voyage again/ }).click()
  await page.waitForFunction(() => window.__STARLING__.snapshot().phase === 'playing')
  report.lossRetry = true
  await page.evaluate(() => {
    const s = window.__STARLING__.dev.session.state, core = window.__FEATURE_CORE__
    s.ship.invulnerable = 30
    while (s.crew.length < 16) { const p = core.createRescueCrew('stress-' + s.crew.length, 'Crew ' + s.crew.length, true, true); p.color = core.RESCUE_CREW_COLORS[s.crew.length % 8]; p.x = (s.crew.length % 6 - 2.5) * .7; s.crew.push(p) }
    s.enemies = []; s.bullets = []
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; core.spawnRescueEnemy(s, ['moth', 'beetle', 'jelly', 'needle', 'sentinel', 'guardian'][i % 6], s.ship.x + Math.cos(a) * 15, s.ship.y + Math.sin(a) * 15) }
    for (let i = 0; i < 160; i++) { const a = i / 160 * Math.PI * 2; core.spawnRescueBullet(s, s.ship.x + Math.cos(a) * 17, s.ship.y + Math.sin(a) * 17, a + Math.PI, 2, 1, true, null, 'orb') }
  })
  await page.waitForTimeout(700)
  report.capacity = await page.evaluate(() => ({ crew: window.__STARLING__.snapshot().crew.length, enemies: window.__STARLING__.snapshot().enemies.length, bullets: window.__STARLING__.snapshot().bullets.length, ...window.__STARLING__.stats() }))
  assert.equal(report.capacity.crew, 16); assert.equal(report.capacity.enemies, 12); assert.ok(report.capacity.bullets > 100); assert.ok(report.capacity.fps >= 25)
  await shot('bounded-combat')
  await page.getByRole('button', { name: 'Pause and settings' }).click()
  await page.getByRole('button', { name: 'Save & return home' }).click()
  if (process.env.GODOT_WON_SAVE) {
    const raw = await readFile(process.env.GODOT_WON_SAVE, 'utf8')
    await page.evaluate(raw => localStorage.setItem('starling-rescue.save.v2', raw), raw)
    await page.reload()
    await page.getByRole('button', { name: /Continue your voyage/ }).click()
    await page.waitForFunction(() => window.__STARLING__?.stats().frames > 90)
    await page.getByRole('button', { name: /Sail into the next chapter/ }).waitFor()
    await shot('real-voyage-victory')
    await page.getByRole('button', { name: /Sail into the next chapter/ }).click()
    await page.waitForFunction(() => window.__STARLING__.snapshot().phase === 'playing' && window.__STARLING__.snapshot().stats.rescues === 0)
    report.realVictorySaveAndNextChapter = true
  }
  assert.deepEqual(errors, [])
  report.passed = true
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.failure = error.stack; report.passed = false
  try { await shot('feature-failure'); report.failureState = await snapshot() } catch {}
  throw error
} finally {
  await writeFile(resolve(evidence, 'feature-smoke.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
