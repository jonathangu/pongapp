import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, webkit } from 'playwright'

const site = process.env.RICOCHET_SITE_URL || 'http://127.0.0.1:5173/pongapp/'
const output = process.env.RICOCHET_EVIDENCE || '/Users/guclaw/.openclaw/workspace/task-artifacts/ricochet-rescue/local-browser'
const engine = process.env.RICOCHET_BROWSER || 'chromium'
const browser = await (engine === 'webkit' ? webkit : chromium).launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await context.newPage(), errors = [], checks = [], skipped = []
page.on('pageerror', error => errors.push(String(error)))
try {
  await page.goto(site + '#/ricochet')
  await page.getByRole('button', { name: 'Help and settings', exact: true }).click()
  await page.getByRole('button', { name: 'Save offline', exact: true }).click()
  await page.getByText('Ready offline. Solo rescue works without a connection.', { exact: true }).waitFor()
  checks.push('first-visit offline pack saved')
  await page.getByRole('checkbox', { name: 'Reduced motion', exact: true }).check()
  await page.locator('.rr-app.rr-reduced').waitFor()
  await page.getByRole('checkbox', { name: 'Sound effects', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Enable sound effects', exact: true }).waitFor()
  checks.push('reduced motion and sound switches')
  await page.getByRole('checkbox', { name: 'Music · Tide Rope', exact: true }).check()
  await page.waitForFunction(() => !document.querySelector('audio').paused)
  await page.getByRole('checkbox', { name: 'Music · Tide Rope', exact: true }).uncheck()
  await page.waitForFunction(() => document.querySelector('audio').paused)
  checks.push('optional music starts and stops')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  // Playwright supports service-worker automation only in Chromium:
  // https://playwright.dev/docs/service-workers
  // WebKit's emulated offline reload produces an internal navigation error;
  // do not misreport that unsupported test as Safari offline validation.
  if (engine === 'chromium') {
  await context.setOffline(true)
  await page.reload()
  await page.locator('.rr-board').waitFor()
  await page.getByRole('button', { name: 'Try a setup ✧', exact: true }).click()
  await page.getByRole('button', { name: 'Launch a little magic ↗', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.rr-stage').classList.contains('rr-in-flight'))
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('starling.ricochet.v1')).rescued), [0])
  checks.push('offline reload and actual solo rescue')
  const notice = await page.evaluate(async () => { const response = await fetch('/pongapp/third-party-ricochet.txt'); return { status: response.status, text: await response.text() } })
  assert.equal(notice.status, 200); assert.ok(notice.text.includes('MIT License'))
  checks.push('license available offline')
  await context.setOffline(false)
  } else skipped.push('offline reload/shot/license require native Safari or physical iPhone verification')
  await page.goto(site)
  await page.getByRole('heading', { name: 'Bring the family home.', exact: true }).waitFor()
  checks.push('original puzzle remains default')
  assert.deepEqual(errors, [])
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/${engine}-offline-receipt.json`, JSON.stringify({ status: 'passed', site, browser: engine, physicalPhone: false, checks, skipped, errors }, null, 2))
  console.log(JSON.stringify({ status: 'passed', site, browser: engine, checks, skipped }))
} finally { await context.close(); await browser.close() }
