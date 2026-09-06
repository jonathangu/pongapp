import { chromium } from '/Users/guclaw/.openclaw/workspace/sites/jonathangu-mobile-impact/node_modules/playwright/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'

const evidence = process.env.STARLING_EVIDENCE || '/Users/guclaw/.openclaw/workspace/task-artifacts/starling-rescue-release'
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] })
const report = []
for (const [name, width, height] of [['phone', 390, 844], ['desktop', 1440, 1000], ['landscape', 844, 390]]) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: name !== 'desktop', isMobile: name !== 'desktop' })
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(process.env.STARLING_URL || 'http://127.0.0.1:5173/pongapp/')
  await page.screenshot({ path: `${evidence}/${name}-home.png`, fullPage: true })
  await page.getByRole('button', { name: /^✦Set sail|Set sail/ }).click()
  await page.waitForFunction(() => window.__STARLING__?.stats().hullAssetLoaded)
  await page.waitForTimeout(1400)
  await page.screenshot({ path: `${evidence}/${name}-game.png` })
  await page.keyboard.press('d', { delay: 300 })
  await page.getByRole('button', { name: /Crew orders/ }).click()
  await page.screenshot({ path: `${evidence}/${name}-orders.png` })
  report.push({ name, width, height, errors, stats: await page.evaluate(() => window.__STARLING__.stats()), crew: await page.evaluate(() => window.__STARLING__.snapshot().crew.map(({ id, x, y, seat }) => ({ id, x, y, seat }))) })
  await context.close()
}
await browser.close()
await writeFile(`${evidence}/visual-smoke.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (report.some(r => r.errors.length)) process.exitCode = 1
