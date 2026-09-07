import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const url = process.env.GODOT_SITE_URL || 'http://127.0.0.1:5173/pongapp/'
const evidence = resolve(process.env.GODOT_EVIDENCE || 'artifacts/two-song-browser')
const fixturePath = process.env.STORY_ENDING_SAVE || '/Users/guclaw/.openclaw/workspace/task-artifacts/starling-mother-son-story/live-voyage/assisted-voyage-save.json'
const report = { runtimeSession: '01a0369d-0914-7190-ac0e-b4d37e1fc052', url, errors: [], layouts: [] }
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const contexts = []
async function tab(viewport, label) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' }); contexts.push(context)
  const page = await context.newPage()
  page.on('pageerror', e => report.errors.push({ label, message: e.message }))
  page.on('console', m => { if (m.type() === 'error') report.errors.push({ label, message: m.text(), location: m.location() }) })
  return { page, context }
}
const shot = (page, name) => page.screenshot({ path: resolve(evidence, name + '.png') })
const song = page => page.evaluate(() => { const a = document.querySelector('audio'); return { src: a.currentSrc, time: a.currentTime, duration: a.duration, paused: a.paused, count: document.querySelectorAll('audio').length, error: a.error?.message ?? '' } })
const playing = (page, track) => page.waitForFunction(track => { const a = document.querySelector('audio'); return a.currentSrc.includes(track) && !a.paused && a.currentTime > .5 && a.readyState >= 2 }, track, { timeout: 30000 })
const ready = page => page.waitForFunction(() => window.__STARLING__?.stats().frames > 45, null, { timeout: 45000 })
async function loadSave(page, save) {
  await page.goto(url); await page.evaluate(save => localStorage.setItem('starling-rescue.save.v2', JSON.stringify(save)), save); await page.reload()
  await page.getByRole('button', { name: /Continue your voyage/ }).click(); await ready(page)
}
try {
  const { page, context } = await tab({ width: 390, height: 844 }, 'selection')
  await page.goto(url)
  await page.getByLabel('Choose theme song').selectOption('turn'); await playing(page, 'each-way-i-turn')
  const secondary = await song(page); assert.ok(secondary.duration > 253 && secondary.duration < 255); assert.equal(secondary.count, 1)
  await shot(page, 'secondary-home-phone')
  await page.getByLabel('Choose theme song').selectOption('tides'); await playing(page, 'tides-of-the-old-world')
  await page.getByLabel('Choose theme song').selectOption('turn'); await page.getByLabel('Choose theme song').selectOption('tides'); await page.getByLabel('Choose theme song').selectOption('turn')
  await playing(page, 'each-way-i-turn'); assert.equal((await song(page)).count, 1)
  await page.getByRole('button', { name: /Play solo/ }).click(); await ready(page)
  await playing(page, 'tides-of-the-old-world')
  assert.equal(await page.getByLabel('Choose theme song').inputValue(), 'tides')
  await page.locator('[data-story-choice="wind"]').click(); await page.locator('[data-story-continue="watch"]').click()
  await page.waitForFunction(() => document.querySelector('audio').paused)
  report.selection = { secondaryDuration: secondary.duration, manualSwitching: true, singleAudioElement: true, rapidSwitching: true, originalOpeningPreserved: true, sailingPauses: true }
  await context.close()

  const original = JSON.parse(await readFile(fixturePath, 'utf8'))
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }]) {
    console.log('Secondary learning cue', viewport)
    const { page, context } = await tab(viewport, 'learning-' + viewport.width)
    const save = structuredClone(original); save.state.phase = 'playing'; save.state.story.pending = 'small-hands'; save.state.story.result = null
    save.state.story.history = save.state.story.history.filter(r => ['watch', 'whale', 'first-light', 'coat', 'sometimes'].includes(r.encounter))
    await loadSave(page, save); await playing(page, 'each-way-i-turn')
    assert.equal(await page.getByLabel('Choose theme song').inputValue(), 'turn')
    const metrics = await page.evaluate(() => ({ reading: document.querySelector('.story-reading').getBoundingClientRect().height, controls: document.querySelector('.story-song').getBoundingClientRect().toJSON(), overflow: document.documentElement.scrollWidth > innerWidth }))
    assert.ok(metrics.reading >= 70); assert.equal(metrics.overflow, false); assert.ok(metrics.controls.bottom <= viewport.height)
    await shot(page, 'learning-' + viewport.width)
    const before = await page.evaluate(() => window.__STARLING__.snapshot().time); await page.waitForTimeout(400)
    assert.equal(await page.evaluate(() => window.__STARLING__.snapshot().time), before)
    await page.locator('[data-story-choice="read"]').click(); await page.locator('[data-story-continue="small-hands"]').waitFor()
    assert.equal((await page.evaluate(() => window.__STARLING__.stats())).song.track, 'turn')
    report.layouts.push({ ...viewport, ...metrics }); await context.close()
  }
  console.log('Family farewell, explicit pause and secondary afterglow')
  const { page: ending, context: ec } = await tab({ width: 390, height: 844 }, 'ending')
  const save = structuredClone(original); save.state.story.pending = 'home'; save.state.story.result = 'pass'
  await loadSave(ending, save); await playing(ending, 'tides-of-the-old-world')
  await ending.getByRole('button', { name: 'Pause theme song', exact: true }).click()
  await ending.locator('[data-story-continue="home"]').click()
  await ending.waitForFunction(() => window.__STARLING__.stats().song.cue === 'afterglow')
  assert.equal((await song(ending)).paused, true, 'Explicit pause was lost at the new cue')
  assert.equal(await ending.getByLabel('Choose theme song').inputValue(), 'turn')
  await ending.getByRole('button', { name: 'Play theme song', exact: true }).click(); await playing(ending, 'each-way-i-turn')
  await ending.getByRole('button', { name: 'Read the family logbook' }).click()
  const growth = ending.getByRole('region', { name: 'Who we are becoming' })
  await growth.evaluate(el => el.scrollIntoView({ block: 'start' })); assert.equal(await growth.locator('article').count(), 4)
  assert.match(await growth.innerText(), /Staying on the channel/); assert.match(await growth.innerText(), /A voice growing steadier/)
  await shot(ending, 'growth-logbook-phone')
  report.ending = { originalFarewellPreserved: true, pauseRespectedAcrossCue: true, secondaryAfterglow: true, fourChoiceBasedReflections: true, previousReleaseSaveCompatible: true }; await ec.close()

  if (process.env.GODOT_OFFLINE === '1') {
    console.log('Both full recordings offline')
    const { page, context } = await tab({ width: 390, height: 844 }, 'offline')
    await page.goto(url); await page.locator('.g-offline summary').click()
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 })
    await page.getByRole('button', { name: /Download offline pack/ }).click()
    await page.getByRole('button', { name: '✓ Offline pack ready', exact: true }).waitFor({ timeout: 180000 })
    await context.setOffline(true); await page.reload()
    await page.getByLabel('Choose theme song').selectOption('turn'); await playing(page, 'each-way-i-turn')
    const secondary = await song(page)
    await page.evaluate(() => { document.querySelector('audio').currentTime = 200 }); await page.waitForFunction(() => document.querySelector('audio').currentTime > 200.5)
    const range = await page.evaluate(async () => { const r = await fetch(document.querySelector('audio').currentSrc, { headers: { Range: 'bytes=1000-1999' } }); return { status: r.status, bytes: (await r.arrayBuffer()).byteLength } })
    assert.equal(range.status, 206); assert.equal(range.bytes, 1000)
    await page.getByLabel('Choose theme song').selectOption('tides'); await playing(page, 'tides-of-the-old-world')
    const primary = await song(page); assert.ok(primary.duration > 377)
    await page.getByRole('button', { name: /Play solo/ }).click(); await ready(page)
    await page.getByLabel('Choose theme song').selectOption('turn'); await playing(page, 'each-way-i-turn')
    await shot(page, 'two-songs-cold-offline')
    report.offline = { bothFullSongs: true, primaryDuration: primary.duration, secondaryDuration: secondary.duration, secondarySeek200Seconds: true, range, coldGodotStartup: true }; await context.close()
  }
  assert.deepEqual(report.errors, []); report.passed = true; console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.passed = false; report.failure = error.stack
  for (const [i, context] of contexts.entries()) for (const page of context.pages()) { try { await shot(page, 'failure-' + i); report['failureSong' + i] = await song(page) } catch {} }
  throw error
} finally { await writeFile(resolve(evidence, 'two-song-browser-smoke.json'), JSON.stringify(report, null, 2)); await browser.close() }
