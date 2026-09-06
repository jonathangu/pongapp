import assert from 'node:assert/strict'
import { chromium } from '/Users/guclaw/.openclaw/workspace/sites/jonathangu-mobile-impact/node_modules/playwright/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
const evidence = process.env.STARLING_EVIDENCE || '/Users/guclaw/.openclaw/workspace/task-artifacts/starling-rescue-release'
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome' }), report = []
try {
for (const [name, width, height] of [['phone', 390, 844], ['landscape', 844, 390]]) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true })
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:5173/pongapp/'); await page.getByRole('button', { name: /Set sail/ }).click()
  await page.waitForFunction(() => window.__STARLING__?.stats().hullAssetLoaded)
  await page.evaluate(async () => {
    const c = await import('/pongapp/@fs/Users/guclaw/.openclaw/workspace/pongapp/packages/game-core/src/rescue/index.ts')
    const { DEFAULT_VOYAGE } = await import('/pongapp/@fs/Users/guclaw/.openclaw/workspace/pongapp/packages/game-core/src/bestiary.ts')
    const s = window.__STARLING__.dev.session.state; s.voyage = DEFAULT_VOYAGE
    while (s.crew.length < 16) { const i = s.crew.length, p = c.createRescueCrew(`capacity-${i}`, `Friend ${i}`, true, true); p.x = (i % 8 - 3.5) * .65; p.y = i >= 8 ? .8 : -1.3; p.color = c.RESCUE_CREW_COLORS[i % 8]; p.order = c.RESCUE_STATIONS[i % 9].id; p.commandSeq = 0; s.crew.push(p) }
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.spawnRescueEnemy(s, ['moth', 'beetle', 'jelly', 'needle', 'sentinel', 'guardian'][i % 6], s.ship.x + Math.cos(a) * 13, s.ship.y + Math.sin(a) * 13) }
    for (let i = 0; i < 160; i++) { const a = i / 160 * Math.PI * 2; c.spawnRescueBullet(s, s.ship.x + Math.cos(a) * 8, s.ship.y + Math.sin(a) * 8, a, 2, 1, true) }
    s.time = 80; s.weather.intensity = 1; s.weather.nextStrike = 1000; s.nextWave = 1000
    window.capacityCore = c
  })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${evidence}/${name}-capacity.png` })
  const full = await page.evaluate(() => ({ stats: window.__STARLING__.stats(), crew: window.__STARLING__.snapshot().crew.length, enemies: window.__STARLING__.snapshot().enemies.length, bullets: window.__STARLING__.snapshot().bullets.length }))
  assert.equal(full.crew, 16); assert.ok(full.stats.renderP95Ms < 25)
  await page.getByRole('button', { name: 'Pause and settings' }).click(); await page.getByLabel('Low effects / battery saver').check(); await page.getByLabel('Reduced motion & flashes').check(); await page.getByRole('button', { name: 'Back to the ship' }).click()
  await page.waitForTimeout(1000)
  const reduced = await page.evaluate(() => window.__STARLING__.stats())
  for (const region of ['jungle', 'space']) {
    await page.evaluate(region => { const d = window.__STARLING__.dev, c = window.capacityCore; const s = c.createRescueGame({ region, biome: region === 'jungle' ? 1 : 2, epoch: d.session.state.epoch + 1 }); d.session.state = s; d.session.authoritative = s }, region)
    await page.waitForTimeout(500); await page.screenshot({ path: `${evidence}/${name}-${region}-detail.png` })
  }
  report.push({ name, fixture: '16 crew,12 enemies,160 initial projectiles and validated builtin recipe ornaments', full, reduced, errors }); assert.deepEqual(errors, [])
  await context.close()
}
} finally { await browser.close(); await writeFile(`${evidence}/capacity-visual.json`, JSON.stringify(report, null, 2)) }
console.log(JSON.stringify(report, null, 2))
