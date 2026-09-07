import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { installedContext, preparePack } from './starling-installed-harness.mjs'

const url = process.env.GODOT_SITE_URL || 'http://127.0.0.1:5173/pongapp/'
const evidence = resolve(process.env.GODOT_EVIDENCE || 'artifacts/crossing-browser')
await mkdir(evidence, { recursive: true })
const report = { runtimeSession: '01a0369d-0914-7190-ac0e-b4d37e1fc052', url, displayMode: 'automated standalone emulation, not physical-phone install evidence', layouts: [], errors: [] }
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
let page
try {
  const plain = await browser.newContext({ viewport: { width: 390, height: 844 } })
  page = await plain.newPage(); await page.goto(url + '#/rescue/ABCDEF')
  await page.getByRole('button', { name: /Install & prepare/ }).waitFor()
  assert.equal(await page.getByRole('button', { name: /Play solo|Play together/ }).count(), 0)
  assert.equal(await page.locator('iframe').count(), 0)
  await page.screenshot({ path: resolve(evidence, 'install-gate.png'), fullPage: true })
  await page.getByRole('button', { name: 'Set up first' }).click()
  await page.getByRole('region', { name: 'Required phone installation' }).waitFor()
  assert.equal(await page.locator('iframe').count(), 0)
  report.gate = { freshBrowserBlocked: true, inviteCannotBypass: true, installStepsVisible: true }
  await plain.close()
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }]) {
    console.log('Crossing layout', viewport)
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' }); await installedContext(context)
    page = await context.newPage()
    page.on('pageerror', e => report.errors.push(e.message))
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()) })
    await page.goto(url); await preparePack(page)
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: resolve(evidence, `home-${viewport.width}.png`) })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'home overflows')
    await page.getByRole('button', { name: /Play solo/ }).click()
    await page.waitForFunction(() => window.__STARLING__?.stats().frames > 45, null, { timeout: 45000 })
    await page.locator('[data-story-choice="wind"]').waitFor()
    await page.waitForFunction(() => window.__STARLING__.stats().song.track === 'tides' && window.__STARLING__.stats().song.playing && window.__STARLING__.stats().song.time > 2)
    assert.equal(await page.evaluate(() => document.querySelector('audio').error), null)
    await page.screenshot({ path: resolve(evidence, `opening-${viewport.width}.png`) })
    const reading = await page.locator('.story-reading').evaluate(e => e.getBoundingClientRect().height)
    assert.ok(reading >= 70, `reading ${reading}`)
    await page.locator('[data-story-choice="wind"]').click(); await page.locator('[data-story-continue="watch"]').click()
    await page.waitForFunction(() => window.__STARLING__.snapshot().crew.find(c => c.id === window.__STARLING__.snapshot().story.motherId)?.seat === 'engine')
    await page.waitForFunction(() => window.__STARLING__.stats().song.track === 'rope' && window.__STARLING__.stats().song.playing)
    await page.screenshot({ path: resolve(evidence, `sailing-${viewport.width}.png`) })
    assert.equal(await page.getByRole('complementary', { name: 'Your next task' }).count(), 1)
    await page.getByRole('button', { name: 'Turn music off', exact: true }).click()
    await page.waitForFunction(() => !window.__STARLING__.stats().song.playing)
    report.layouts.push({ ...viewport, reading, stats: await page.evaluate(() => window.__STARLING__.stats()) })
    await context.close()
  }
  assert.deepEqual(report.errors, []); report.passed = true
} catch (e) { report.passed = false; report.failure = e.stack; if (page && !page.isClosed()) { await page.screenshot({ path: resolve(evidence, 'failure.png') }); report.failureState = await page.evaluate(() => ({ state: window.__STARLING__?.snapshot(), stats: window.__STARLING__?.stats(), audio: document.querySelector('audio') && { code: document.querySelector('audio').error?.code, error: document.querySelector('audio').error?.message, src: document.querySelector('audio').currentSrc } })); } throw e }
finally { await writeFile(resolve(evidence, 'crossing-browser-smoke.json'), JSON.stringify(report, null, 2)); await browser.close() }
