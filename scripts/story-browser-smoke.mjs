import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const url = process.env.GODOT_SITE_URL || 'http://127.0.0.1:5173/pongapp/'
const evidence = resolve(process.env.GODOT_EVIDENCE || 'artifacts/story-browser')
const report = { runtimeSession: '01a0369d-0914-7190-ac0e-b4d37e1fc052', url, at: new Date().toISOString(), layouts: [], errors: [] }
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const contexts = []
async function tab(viewport, label) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' }); contexts.push(context)
  const page = await context.newPage()
  page.on('pageerror', error => report.errors.push({ label, message: error.message }))
  page.on('console', message => { if (message.type() === 'error') report.errors.push({ label, message: message.text() }) })
  return { page, context }
}
const snapshot = page => page.evaluate(() => window.__STARLING__.snapshot())
const stats = page => page.evaluate(() => window.__STARLING__.stats())
const shot = (page, name) => page.screenshot({ path: resolve(evidence, name + '.png') })
const ready = page => page.waitForFunction(() => window.__STARLING__?.stats().frames > 45, null, { timeout: 45000 })
async function start(page, name = 'Story Proof', online = false) {
  await page.goto(url); await page.locator('.g-player-name input').fill(name)
  await page.getByRole('button', { name: online ? /Play together/ : /Play solo/ }).click()
  await ready(page); await page.locator('[data-story-choice="wind"]').waitFor()
}
async function choose(page, id) { await page.locator(`[data-story-choice="${id}"]`).click(); await page.locator('[data-story-continue]').waitFor() }
async function proceed(page) { await page.locator('[data-story-continue]').click(); await page.locator('.story-dialog').waitFor({ state: 'hidden' }) }
try {
  for (const viewport of process.env.STORY_OFFLINE_ONLY ? [] : [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }]) {
    console.log('Story layout', viewport)
    const { page, context } = await tab(viewport, 'layout-' + viewport.width)
    await page.goto(url); await page.screenshot({ path: resolve(evidence, `home-${viewport.width}.png`), fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Home overflow')
    await start(page)
    const layout = await page.evaluate(() => ({ reading: document.querySelector('.story-reading').getBoundingClientRect().height, choices: [...document.querySelectorAll('[data-story-choice]')].map(e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right } }) }))
    assert.ok(layout.reading >= 70, 'Reading area too short')
    for (const box of layout.choices) assert.ok(box.top >= 0 && box.bottom <= viewport.height && box.left >= 0 && box.right <= viewport.width)
    await shot(page, `opening-${viewport.width}`)
    const s = await snapshot(page); await page.waitForTimeout(600)
    assert.equal((await snapshot(page)).time, s.time)
    await page.waitForFunction(() => window.__STARLING__.stats().song.time > .5)
    const song = (await stats(page)).song; assert.ok(song.duration > 377 && song.duration < 379); assert.equal(song.playing, true)
    await choose(page, 'wind'); await shot(page, `response-${viewport.width}`)
    await proceed(page)
    await page.waitForFunction(() => window.__STARLING__.snapshot().crew.find(c => c.id === window.__STARLING__.snapshot().story.motherId)?.seat === 'engine')
    assert.equal((await stats(page)).song.playing, false)
    await shot(page, `sailing-${viewport.width}`)
    report.layouts.push({ ...viewport, ...layout, song })
    if (viewport.width === 390) {
      const before = await snapshot(page)
      await page.keyboard.down('KeyD'); await page.waitForTimeout(3200); await page.keyboard.up('KeyD')
      const moved = await snapshot(page); assert.ok(moved.stats.travel - before.stats.travel > 18)
      await page.locator('[data-story-choice="whale"]').waitFor({ timeout: 15000 })
      const choiceBefore = await snapshot(page)
      await choose(page, 'whale')
      const result = await snapshot(page)
      assert.equal(result.ship.hp, choiceBefore.ship.hp - 2); assert.equal(result.campaign.salvage, choiceBefore.campaign.salvage + 10)
      await shot(page, 'whale-result-phone')
      await page.getByRole('button', { name: 'Save & return home', exact: true }).click()
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('starling-rescue.save.v2')).state)
      assert.equal(saved.story.result, 'whale')
      await page.getByRole('button', { name: /Continue your voyage/ }).click(); await ready(page)
      assert.equal((await snapshot(page)).campaign.salvage, result.campaign.salvage)
      assert.equal(await page.locator('[data-story-choice]').count(), 0)
      await proceed(page)
      await page.getByRole('button', { name: 'Open logbook', exact: true }).click()
      await page.getByRole('dialog', { name: 'The Starling logbook' }).waitFor()
      await page.waitForTimeout(200); const paused = (await snapshot(page)).time
      await page.waitForTimeout(500); assert.equal((await snapshot(page)).time, paused)
      assert.equal(await page.locator('.story-entry').count(), 2)
      await shot(page, 'logbook-phone'); await page.getByRole('button', { name: 'Close logbook' }).click()
      await page.getByRole('button', { name: 'Cook', exact: true }).click()
      await page.waitForFunction(() => window.__STARLING__.snapshot().crew.find(c => c.id === window.__STARLING__.snapshot().story.motherId)?.seat === 'galley')
      await page.getByRole('button', { name: 'Deck', exact: true }).click()
      await page.getByLabel('Choose crewmate to command').selectOption((await snapshot(page)).story.sonId)
      await page.locator('.g-all-stations').getByRole('button', { name: /Helm/ }).click()
      await page.waitForFunction(() => window.__STARLING__.snapshot().crew.find(c => c.id === window.__STARLING__.snapshot().story.sonId)?.seat === 'engine')
      await shot(page, 'finn-at-wheel-phone')
      report.solo = { travel: moved.stats.travel - before.stats.travel, exactCost: true, savedResult: true, logbookPaused: true, finnPhysicallyAtHelm: true }
    }
    await context.close()
  }
  if (!process.env.STORY_OFFLINE_ONLY) {
  console.log('Story co-op: shared pause, roles and reconnect')
  const { page: host, context: hc } = await tab({ width: 1440, height: 1000 }, 'host')
  await start(host, 'Mother Proof', true)
  const code = (await host.getByRole('button', { name: /Invite ·/ }).innerText()).match(/[A-Z2-9]{6}/)?.[0]; assert.ok(code)
  const { page: guest, context: gc } = await tab({ width: 390, height: 844 }, 'guest')
  await guest.goto(url); await guest.locator('.g-player-name input').fill('Son Proof')
  await guest.goto(url + '#/rescue/' + code); await guest.reload(); await ready(guest)
  await guest.locator('[data-story-choice="wind"]').waitFor()
  assert.equal(await guest.locator('[data-story-choice="wind"]').isDisabled(), true)
  const joined = await snapshot(guest), son = joined.story.sonId
  assert.equal(joined.crew.find(c => c.id === son).name, 'Son Proof')
  assert.equal(joined.crew.find(c => c.id === son).pet, false)
  assert.equal(joined.crew.filter(c => c.id === son).length, 1)
  await host.waitForTimeout(1000); assert.equal((await snapshot(host)).time, 0); assert.equal((await snapshot(guest)).time, 0)
  await shot(guest, 'shared-choice-guest')
  await choose(host, 'carry'); await guest.locator('[data-story-continue]').waitFor()
  assert.equal((await snapshot(guest)).story.result, 'carry'); assert.equal(await guest.locator('[data-story-continue]').isDisabled(), true)
  await proceed(host); await guest.locator('.story-dialog').waitFor({ state: 'hidden' })
  await guest.waitForFunction(() => window.__STARLING__.snapshot().crew.find(c => c.id === window.__STARLING__.snapshot().story.sonId)?.seat === 'east')
  await gc.setOffline(true); await guest.evaluate(() => dispatchEvent(new Event('offline'))); await host.waitForTimeout(600)
  await gc.setOffline(false); await guest.evaluate(() => dispatchEvent(new Event('online')))
  await guest.waitForFunction(() => window.__STARLING__.stats().connected && window.__STARLING__.stats().status.startsWith('Online'), null, { timeout: 20000 })
  const restored = await snapshot(guest); assert.equal(restored.story.sonId, son); assert.equal(restored.crew.filter(c => c.id === son).length, 1); assert.equal(restored.story.history[0].choice, 'carry')
  report.coOp = { code, sharedPause: true, guestCannotChoose: true, actualFinnRole: son, identityAndStoryAfterReconnect: true }
  await gc.close(); await hc.close()
  }
  if (process.env.STORY_ENDING_SAVE) {
    console.log('Story ending display from verified full-voyage save')
    const { page, context } = await tab({ width: 390, height: 844 }, 'ending')
    const save = JSON.parse(await readFile(process.env.STORY_ENDING_SAVE, 'utf8'))
    save.state.story.pending = 'home'; save.state.story.result = 'pass'
    await page.goto(url); await page.evaluate(save => localStorage.setItem('starling-rescue.save.v2', JSON.stringify(save)), save); await page.reload()
    await page.getByRole('button', { name: /Continue your voyage/ }).click(); await ready(page)
    await page.locator('[data-story-continue="home"]').waitFor(); await shot(page, 'ending-phone')
    await page.waitForFunction(() => window.__STARLING__.stats().song.time > .5)
    assert.equal((await snapshot(page)).story.history.length, 8)
    await proceed(page); await page.getByRole('button', { name: 'Read the family logbook' }).click()
    assert.equal(await page.locator('.story-entry').count(), 8); await shot(page, 'complete-logbook-phone')
    report.ending = { eightMoments: true, songPlaying: true, originalWatchEnding: true }; await context.close()
  }
  if (process.env.GODOT_OFFLINE === '1') {
    console.log('Offline pack, cold Godot startup and seekable local song')
    const { page, context } = await tab({ width: 390, height: 844 }, 'offline')
    await page.goto(url); await page.locator('.g-offline summary').click()
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 })
    await page.getByRole('button', { name: /Download offline pack/ }).click()
    await page.getByRole('button', { name: '✓ Offline pack ready', exact: true }).waitFor({ timeout: 180000 })
    await context.setOffline(true); await page.reload()
    await page.getByRole('button', { name: /Play solo/ }).click(); await ready(page)
    await page.waitForFunction(() => window.__STARLING__.stats().song.time > .5)
    const range = await page.evaluate(async () => { const a = document.querySelector('audio'); const r = await fetch(a.currentSrc, { headers: { Range: 'bytes=1000-1999' } }); return { status: r.status, bytes: (await r.arrayBuffer()).byteLength, range: r.headers.get('content-range') } })
    assert.equal(range.status, 206); assert.equal(range.bytes, 1000)
    await page.evaluate(() => { document.querySelector('audio').currentTime = 300 })
    await page.waitForFunction(() => document.querySelector('audio').currentTime > 300.5)
    await shot(page, 'offline-song-phone')
    report.offline = { coldEngine: (await stats(page)).engine, localSongPlaying: true, seekToFiveMinutes: true, range }; await context.close()
  }
  assert.deepEqual(report.errors, []); report.passed = true; console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.passed = false; report.failure = error.stack
  for (const [i, context] of contexts.entries()) for (const page of context.pages()) { try { await shot(page, 'failure-' + i); report['failureState' + i] = { state: await snapshot(page), stats: await stats(page) } } catch {} }
  throw error
} finally { await writeFile(resolve(evidence, 'story-browser-smoke.json'), JSON.stringify(report, null, 2)); await browser.close() }
