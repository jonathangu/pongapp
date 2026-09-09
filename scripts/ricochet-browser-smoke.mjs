import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, webkit } from 'playwright'

const site = process.env.RICOCHET_SITE_URL || 'http://127.0.0.1:5173/pongapp/'
const output = process.env.RICOCHET_EVIDENCE || '/Users/guclaw/.openclaw/workspace/task-artifacts/ricochet-rescue/local-browser'
const engineName = process.env.RICOCHET_BROWSER || 'chromium'
const quick = process.env.RICOCHET_SMOKE_QUICK === '1'
await mkdir(output, { recursive: true })
const browser = await (engineName === 'webkit' ? webkit : chromium).launch({ headless: true })
const checks = [], errors = [], contexts = []
const prototype = site + '#/ricochet'
const originalSave = JSON.stringify({ keep: 'original Starling save must remain untouched' })
async function context(width = 390, height = 844, fixture) {
  const result = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600 })
  contexts.push(result)
  await result.addInitScript(({ originalSave, fixture }) => {
    if (!localStorage.getItem('starling.puzzle.v1')) localStorage.setItem('starling.puzzle.v1', originalSave)
    if (fixture && !localStorage.getItem('starling.ricochet.v1')) localStorage.setItem('starling.ricochet.v1', JSON.stringify(fixture))
  }, { originalSave, fixture })
  const page = await result.newPage()
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(prototype)
  await page.locator('.rr-board').waitFor()
  await page.evaluate(() => document.fonts.ready)
  return { context: result, page }
}
async function inspect(page, label) {
  const layout = await page.evaluate(() => {
    const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom } }
    return { viewport: { width: innerWidth, height: innerHeight }, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
      board: rect('.rr-board'), launch: rect('.rr-controls .rr-launch'), footer: rect('.rr-footer'), text: document.querySelector('.rr-instruction').textContent,
      originalSave: localStorage.getItem('starling.puzzle.v1'), musicRequests: performance.getEntriesByType('resource').filter(e => /\.m4a/.test(e.name)).length }
  })
  assert.ok(layout.width <= layout.viewport.width, 'Horizontal overflow: ' + label)
  assert.equal(layout.originalSave, originalSave)
  assert.equal(layout.musicRequests, 0, 'Music must not download before it is enabled')
  await page.screenshot({ path: `${output}/${engineName}-${label}.png`, fullPage: true, animations: 'disabled' })
  checks.push({ label, ...layout })
  console.log(JSON.stringify({ step: label, viewport: layout.viewport, documentHeight: layout.height, board: layout.board, launch: layout.launch }))
}
async function game(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('starling.ricochet.v1') || 'null')) }
async function settled(page) { await page.waitForFunction(() => !document.querySelector('.rr-stage').classList.contains('rr-in-flight')); await page.waitForTimeout(80) }
async function soloShot(page) {
  await settled(page)
  await page.getByRole('button', { name: 'Launch a little magic ↗', exact: true }).click()
  await settled(page)
}
try {
  const { page } = await context()
  await inspect(page, '390-initial')
  if (!quick) {
    const rect = await page.locator('.rr-board').boundingBox()
    const point = (x, y) => ({ x: rect.x + x / 360 * rect.width, y: rect.y + y / 440 * rect.height })
    const start = point(180, 337), end = point(208, 315)
    if (engineName === 'chromium') {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
      for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * i / 6, y: start.y + (end.y - start.y) * i / 6 }] }); await page.waitForTimeout(20) }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach()
    } else { await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 6 }); await page.mouse.up() }
    assert.ok(Math.abs((await game(page)).setup.aim + 90) > 5, 'Dragging the aim handle changes the real setup')
    await page.getByRole('button', { name: 'Try a setup ✧', exact: true }).click()
    await soloShot(page)
    assert.deepEqual((await game(page)).rescued, [0])
    for (let level = 0; level < 3; level++) {
      let selectedSpecial = false
      for (let attempt = 0; attempt < 18; attempt++) {
        if (await page.locator('.rr-result').count()) break
        const current = await game(page)
        if (level === 1 && current.learned >= 2 && !selectedSpecial) {
          await page.locator('.rr-jobs button').nth(1).click(); await page.getByRole('button', { name: '⋔ Split', exact: true }).click(); await page.locator('.rr-jobs button').nth(0).click(); selectedSpecial = true
        }
        if (level === 2 && current.learned >= 4 && !selectedSpecial) {
          await page.locator('.rr-jobs button').nth(0).click(); await page.getByRole('button', { name: '➜ Pierce', exact: true }).click(); selectedSpecial = true
        }
        await page.getByRole('button', { name: 'Try a setup ✧', exact: true }).click()
        await soloShot(page)
      }
      assert.equal(await page.locator('.rr-result').count(), 1, 'Scene completed through visible controls')
      await inspect(page, `scene-${level + 1}-complete`)
      if (level < 2) await page.getByRole('button', { name: 'Next little adventure →', exact: true }).click()
    }
    const saved = await game(page)
    await page.reload(); await page.locator('.rr-result').waitFor()
    assert.deepEqual(await game(page), saved)
    checks.push({ label: 'solo-three-scenes-and-reload', result: 'passed' })
    for (const [width, height] of [[320, 568], [375, 667], [430, 932], [1024, 800]]) {
      const other = await context(width, height); await inspect(other.page, `${width}-initial`)
    }
    const fixture = { version: 1, scene: 1, shots: 1, learned: 4, rescued: [0, 1, 2], setup: {
      aim: Math.atan2(265 - 402, 100) * 180 / Math.PI, payload: 'burst', reflector: { x: 280, y: 265, angle: -87, mode: 'split' } } }
    const combo = await context(390, 844, fixture)
    await inspect(combo.page, 'combo-ready')
    await combo.page.getByRole('button', { name: 'Launch a little magic ↗', exact: true }).click()
    await combo.page.locator('[data-rr-effect="burst"]').first().waitFor(); await combo.page.waitForTimeout(130)
    await combo.page.screenshot({ path: `${output}/${engineName}-triple-fireworks.png`, fullPage: true })
    await settled(combo.page)
    assert.ok((await game(combo.page)).rescued.length >= 10)
    checks.push({ label: 'visible-triple-fireworks', result: 'passed' })

    // Separate browser contexts model separate phones, with separate guest tokens/saves.
    const host = await context(390, 844, fixture), guest = await context(375, 812)
    await host.page.getByRole('button', { name: 'Play together ♡', exact: true }).click()
    const link = host.page.getByRole('textbox', { name: 'Ricochet invitation link' }); await link.waitFor()
    const invitation = await link.inputValue()
    await host.page.getByRole('button', { name: 'Close dialog', exact: true }).click()
    await guest.page.goto(invitation); await guest.page.locator('.rr-app[data-rr-job="reflector"]').waitFor()
    await guest.page.getByRole('button', { name: 'Reflector ready ✓', exact: true }).waitFor()
    await guest.page.locator('[data-rr-rotate]').press('ArrowRight')
    await host.page.waitForFunction(() => Number(document.querySelector('[data-rr-reflector]').dataset.angle) === -84)
    await guest.page.locator('[data-rr-rotate]').press('ArrowLeft')
    await host.page.waitForFunction(() => Number(document.querySelector('[data-rr-reflector]').dataset.angle) === -87)
    await guest.page.getByRole('button', { name: 'Reflector ready ✓', exact: true }).click()
    await host.page.getByRole('button', { name: 'Launch a little magic ↗', exact: true }).waitFor()
    await host.page.locator('[data-rr-aim]').press('ArrowLeft')
    await guest.page.getByRole('button', { name: 'Reflector ready ✓', exact: true }).waitFor()
    await host.page.locator('[data-rr-aim]').press('ArrowRight')
    await guest.page.waitForFunction(expected => Math.abs(Number(document.querySelector('.rr-app').dataset.rrAimAngle) - expected) < .00001, fixture.setup.aim)
    await guest.page.getByRole('button', { name: 'Reflector ready ✓', exact: true }).click()
    await host.page.getByRole('button', { name: 'Launch a little magic ↗', exact: true }).click()
    await guest.page.locator('.rr-in-flight').waitFor()
    const shotId = await host.page.locator('.rr-app').getAttribute('data-rr-shot')
    await guest.page.reload(); await guest.page.locator('.rr-app[data-rr-job="reflector"]').waitFor()
    assert.equal(await guest.page.locator('.rr-app').getAttribute('data-rr-shot'), shotId)
    await settled(host.page); await settled(guest.page)
    assert.equal(await host.page.locator('.rr-meter').getAttribute('aria-valuenow'), await guest.page.locator('.rr-meter').getAttribute('aria-valuenow'))
    assert.ok(Number(await host.page.locator('.rr-meter').getAttribute('aria-valuenow')) >= 10)
    assert.deepEqual(await game(host.page), fixture, 'Shared rescue never overwrites the host solo save')
    await host.page.getByRole('button', { name: 'Swap jobs ⇄', exact: true }).click()
    await host.page.locator('.rr-app[data-rr-job="reflector"]').waitFor(); await guest.page.locator('.rr-app[data-rr-job="aim"]').waitFor()
    await inspect(host.page, 'coop-host-after-swap'); await inspect(guest.page, 'coop-guest-after-swap')
    const extra = await context(); await extra.page.goto(invitation)
    await extra.page.getByText('This boat already has two people. Start a fresh invitation.', { exact: false }).waitFor()
    checks.push({ label: 'two-browser-coop-edit-ready-reconnect-swap-isolation', result: 'passed' })
  }
  assert.deepEqual(errors, [])
  await writeFile(`${output}/${engineName}-receipt.json`, JSON.stringify({ status: 'passed', site, browser: engineName, physicalPhone: false, checks, errors }, null, 2))
  console.log(JSON.stringify({ test: 'ricochet-browser-smoke', status: 'passed', site, browser: engineName, physicalPhone: false, checks: checks.length, output }))
} finally { await Promise.all(contexts.map(context => context.close())); await browser.close() }
