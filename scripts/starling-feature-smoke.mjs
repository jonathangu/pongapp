import assert from 'node:assert/strict'
import { chromium } from '/Users/guclaw/.openclaw/workspace/sites/jonathangu-mobile-impact/node_modules/playwright/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
const evidence = process.env.STARLING_EVIDENCE || '/Users/guclaw/.openclaw/workspace/task-artifacts/starling-rescue-release'
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const report = []
const coreUrl = '/pongapp/@fs/Users/guclaw/.openclaw/workspace/pongapp/packages/game-core/src/rescue/index.ts'
try {
for (const [name, width, height] of [['phone', 390, 844], ['landscape', 844, 390], ['desktop', 1440, 1000]]) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: name !== 'desktop', isMobile: name !== 'desktop' })
  const page = await context.newPage(), errors = [], result = { name, errors, checks: [] }
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:5173/pongapp/')
  await page.getByRole('button', { name: /Set sail/ }).click()
  await page.waitForFunction(() => window.__STARLING__?.dev && window.__STARLING__.stats().hullAssetLoaded)
  await page.evaluate(async url => { window.rescueTestCore = await import(url) }, coreUrl)
  await page.keyboard.press('c')
  await page.getByRole('button', { name: 'SHD Shield', exact: true }).click()
  result.checks.push('C opens orders and sends companion toward shield')
  // Assist only route planning; actual ship-local movement uses the same input stream as controls.
  const walkTo = async station => {
    await page.evaluate(station => {
      const { session, controls } = window.__STARLING__.dev, core = window.rescueTestCore
      window.routeTimer = setInterval(() => {
        const p = session.state.crew.find(c => c.id === session.playerId)
        if (p.seat === station) { clearInterval(window.routeTimer); controls.clear(); return }
        const input = core.routeRescueCrew(p, station, session.state.tick, 1 / 60)
        controls.x = input.x; controls.y = input.y; controls.buttons = input.buttons
      }, 16)
    }, station)
    await page.waitForFunction(station => { const d = window.__STARLING__; return d.snapshot().crew.find(c => c.id === d.dev.session.playerId).seat === station }, station, { timeout: 20000 })
    await page.evaluate(() => { clearInterval(window.routeTimer); window.__STARLING__.dev.controls.clear() })
  }
  await walkTo('galley')
  await page.keyboard.down('f')
  await page.waitForFunction(() => window.__STARLING__.snapshot().meal.remaining > 70)
  await page.keyboard.up('f'); await page.keyboard.press('Space')
  await page.waitForFunction(() => window.__STARLING__.snapshot().crew[0].seat === null)
  result.checks.push('walked to galley, cooked and left with timed meal')
  const audio = []
  for (let i = 0; i < 12; i++) { await page.waitForTimeout(100); audio.push(await page.evaluate(() => window.__STARLING__.stats().audio.rms)) }
  assert.ok(Math.max(...audio) > .0005, `No audible output ${audio}`)
  await page.getByRole('button', { name: 'Pause and settings' }).click()
  for (const label of ['Music', 'Sound effects']) await page.getByLabel(label, { exact: true }).fill('0')
  await page.waitForTimeout(1500)
  const muted = await page.evaluate(() => window.__STARLING__.stats().audio.rms)
  assert.ok(muted < .000001, `Mute leaked audio: ${muted}`)
  await page.getByLabel('Music', { exact: true }).fill('0.5')
  await page.getByLabel('Sound effects', { exact: true }).fill('0.65')
  await page.getByRole('button', { name: 'Back to the ship' }).click()
  result.audio = { maxRms: Math.max(...audio), mutedRms: muted }
  await walkTo('map')
  await page.getByRole('heading', { name: 'Your voyage', exact: true }).waitFor()
  result.checks.push('map seat opens map')
  await page.screenshot({ path: `${evidence}/${name}-map.png` })
  await page.getByRole('button', { name: 'Close menu' }).click()
  // Explicit visual fixture: heavy weather, full creature variety and metal weapon.
  await page.evaluate(() => {
    const s = window.__STARLING__.dev.session.state, core = window.rescueTestCore
    s.time = 75; s.weather.intensity = 1; s.weather.nextStrike = s.time + 100; s.nextWave = s.time + 100; s.enemies = []
    const places = [[-6, 11], [5, 11], [-7, 4], [7, 3], [-6, -8], [5, -9]]
    for (const [i, kind] of ['moth', 'guardian', 'jelly', 'beetle', 'needle', 'sentinel'].entries()) core.spawnRescueEnemy(s, kind, s.ship.x + places[i][0], s.ship.y + places[i][1])
    s.stations.find(st => st.id === 'west').upgrade = 'metal'
    s.stations.find(st => st.id === 'west').flailAngle = -Math.PI * .8
    const p = s.crew[0]; p.seat = null
    s.weather.strike = { x: s.ship.x + 3, y: s.ship.y + 5, at: s.time + 1.5 }
  })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${evidence}/${name}-storm-creatures.png` })
  await page.waitForTimeout(850)
  await page.screenshot({ path: `${evidence}/${name}-lightning.png` })
  result.busy = await page.evaluate(() => window.__STARLING__.stats())
  // Explicit dock approach fixture; purchases and travel then use actual UI/actions.
  await page.evaluate(() => {
    const s = window.__STARLING__.dev.session.state
    s.enemies = []; s.bullets = []; s.ship.x = -15; s.ship.y = -22; s.ship.vx = s.ship.vy = 0; s.time = 0; s.weather.intensity = 0; s.weather.strike = null
  })
  await page.getByRole('button', { name: /Dock at Little Lantern Town/ }).click()
  await page.getByRole('button', { name: /hull.*hearts/ }).click()
  await page.getByRole('button', { name: /\+ Tavi/ }).click()
  await page.screenshot({ path: `${evidence}/${name}-port.png` })
  let state = await page.evaluate(() => window.__STARLING__.snapshot())
  assert.equal(state.ship.maxHp, 15); assert.ok(state.crew.some(c => c.name === 'Tavi'))
  await page.getByRole('button', { name: 'Save voyage', exact: true }).click()
  assert.ok(await page.evaluate(() => localStorage.getItem('starling-rescue.save.v1')))
  result.checks.push('dock repaired, hull upgraded, Tavi recruited and shared campaign saved')
  await page.getByRole('button', { name: 'Cast off', exact: true }).click()
  await page.evaluate(() => { const s = window.__STARLING__.dev.session.state; s.ship.x = 37; s.ship.y = 33; s.ship.vx = s.ship.vy = 0 })
  await page.getByRole('button', { name: /Dock at Skyhook/ }).click()
  await page.getByRole('button', { name: /Launch into space/ }).click()
  await page.waitForFunction(() => window.__STARLING__.snapshot().region === 'space')
  await page.waitForTimeout(800); await page.screenshot({ path: `${evidence}/${name}-space.png` })
  assert.equal(await page.evaluate(() => window.__STARLING__.snapshot().campaign.upgrades.hull), 1)
  result.checks.push('space launch changed scenery and retained upgrade')
  await page.evaluate(() => { const s = window.__STARLING__.dev.session.state; s.ship.x = 24; s.ship.y = -22; s.ship.vx = s.ship.vy = 0 })
  await page.getByRole('button', { name: /Dock at Bluewater/ }).click()
  await page.getByRole('button', { name: /Return to the sea/ }).click()
  await page.waitForFunction(() => window.__STARLING__.snapshot().region === 'sea')
  await page.evaluate(() => { const s = window.__STARLING__.dev.session.state; s.ship.x = 24; s.ship.y = -22; s.ship.vx = s.ship.vy = 0 })
  await page.getByRole('button', { name: /Dock at Fernheart Island/ }).click()
  await page.getByRole('button', { name: /Enter the jungle/ }).click()
  await page.waitForFunction(() => window.__STARLING__.snapshot().region === 'jungle')
  await page.waitForTimeout(800); await page.screenshot({ path: `${evidence}/${name}-jungle.png` })
  result.checks.push('sea return and jungle travel')
  assert.deepEqual(errors, []); report.push(result); await context.close()
}
} finally { await browser.close(); await writeFile(`${evidence}/feature-smoke.json`, JSON.stringify(report, null, 2)) }
console.log(JSON.stringify(report, null, 2))
