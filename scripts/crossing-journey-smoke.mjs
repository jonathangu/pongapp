import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { installedContext, preparePack } from './starling-installed-harness.mjs'

const url = process.env.GODOT_SITE_URL || 'http://127.0.0.1:5173/pongapp/'
const evidence = resolve(process.env.GODOT_EVIDENCE || 'artifacts/crossing-journey')
await mkdir(evidence, { recursive: true })
const report = { runtimeSession: '01a0369d-0914-7190-ac0e-b4d37e1fc052', url, displayMode: 'standalone emulation; no physical-phone claim', errors: [], tutorial: [], scenes: [] }
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const contexts = []
const state = page => page.evaluate(() => window.__STARLING__.snapshot())
const ready = page => page.waitForFunction(() => window.__STARLING__?.stats().frames > 45, null, { timeout: 45000 })
const shot = (page, name) => page.screenshot({ path: resolve(evidence, name + '.png') })
async function phone(label) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); contexts.push(context)
  await installedContext(context)
  const page = await context.newPage()
  page.on('pageerror', e => report.errors.push({ label, message: e.message }))
  page.on('console', m => { if (m.type() === 'error') report.errors.push({ label, message: m.text() }) })
  await page.goto(url); await preparePack(page)
  return { page, context }
}
async function seaScene(page, s) {
  const choices = { watch: 'wind', whale: 'channel', 'first-light': 'signal', coat: 'patch', sometimes: 'spoon', 'small-hands': 'read', keeper: 'together', home: 'pass' }
  if (!s.story.result) await page.locator(`[data-story-choice="${choices[s.story.pending]}"]`).click()
  await page.locator('[data-story-continue]').click()
}
// Ordinary pointer gestures against the visible joystick; no state mutation.
async function steer(page, target, s) {
  const box = await page.getByRole('application', { name: 'Steering joystick' }).boundingBox()
  assert.ok(box)
  const dx = target.x - s.ship.x, dy = target.y - s.ship.y, d = Math.max(.001, Math.hypot(dx, dy)), scale = Math.min(.7, d * .1) * 48
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx / d * scale, box.y + box.height / 2 - dy / d * scale)
  await page.waitForTimeout(300); await page.mouse.up()
}
try {
  if (!process.env.CROSSING_COOP_ONLY) {
    console.log('Five-step tutorial through actual portrait controls')
    const { page, context } = await phone('tutorial')
    await page.getByRole('button', { name: /Play solo/ }).click(); await ready(page)
    let previous = -1
    const until = Date.now() + 120000
    while (Date.now() < until) {
      const s = await state(page), step = s.seamanship.step
      if (s.story?.pending) { await seaScene(page, s); continue }
      if (step !== previous) { console.log('Tutorial step', step, s.time); report.tutorial.push({ step, time: s.time, hp: s.ship.hp, rescues: s.stats.rescues }); await shot(page, 'tutorial-' + step); previous = step }
      if (step === 5) break
      if (step === 2 || step === 4) {
        const crew = s.crew.find(c => c.id === s.story.motherId)
        if (step === 4 ? crew.order !== 'galley' : !['east', 'west', 'north', 'south'].includes(crew.order)) await page.getByRole('button', { name: step === 2 ? 'Cannons' : 'Cook', exact: true }).click()
        await page.waitForTimeout(350); continue
      }
      const cage = [...s.world.cages].filter(c => !c.rescued).sort((a, b) => Math.hypot(a.x - s.ship.x, a.y - s.ship.y) - Math.hypot(b.x - s.ship.x, b.y - s.ship.y))[0]
      if (s.crew.find(c => c.id === s.story.motherId).order !== 'engine') await page.getByRole('button', { name: 'Helm', exact: true }).click()
      if (s.crew.find(c => c.id === s.story.motherId).seat !== 'engine') { await page.waitForTimeout(250); continue }
      const d = Math.hypot(cage.x, cage.y + 24)
      await steer(page, step === 0 ? { x: s.ship.x + 10, y: s.ship.y } : cage.open ? cage : { x: cage.x - cage.x / d * 18, y: cage.y - (cage.y + 24) / d * 18 }, s)
    }
    const practiced = await state(page)
    assert.equal(practiced.seamanship.step, 5); assert.ok(practiced.stats.rescues >= 1); assert.ok(practiced.meal.remaining > 0); assert.ok(practiced.littleWing.arrivals > 0)
    assert.ok(report.tutorial.every(s => s.hp === 12), 'Practice must remain safe')
    await page.getByRole('button', { name: 'Pause and settings', exact: true }).click()
    await page.getByLabel('Sea difficulty').selectOption('tempest'); await page.waitForFunction(() => window.__STARLING__.snapshot().seamanship.difficulty === 'tempest')
    await page.getByLabel('Sea difficulty').selectOption('gentle')
    await page.getByRole('button', { name: 'Save & return home', exact: true }).click(); await preparePack(page)
    await page.getByRole('button', { name: /Continue your voyage/ }).click(); await ready(page)
    assert.equal((await state(page)).seamanship.step, 5)
    report.tutorialSaved = true
    await context.close()

    console.log('Part II from the verified full-voyage save')
    const p2 = await phone('part2'), p = p2.page
    const save = JSON.parse(await readFile(process.env.STORY_ENDING_SAVE, 'utf8'))
    assert.equal(save.state.phase, 'won'); assert.equal(save.state.story.history.length, 8)
    await p.evaluate(save => localStorage.setItem('starling-rescue.save.v2', JSON.stringify(save)), save); await p.reload(); await preparePack(p)
    await p.getByRole('button', { name: /Continue your voyage/ }).click(); await ready(p)
    await p.getByRole('button', { name: /Part II · Lift into the sky/ }).click()
    const end = Date.now() + 150000
    while (Date.now() < end) {
      const s = await state(p)
      if (s.odyssey?.pending) {
        const id = s.odyssey.pending
        await p.locator(`[data-odyssey-continue="${id}"]`).waitFor()
        await p.waitForFunction(() => window.__STARLING__.stats().song.track === 'hearts' && window.__STARLING__.stats().song.playing)
        await shot(p, 'part2-' + id); report.scenes.push({ id, stage: s.odyssey.stage, time: s.time })
        await p.locator(`[data-odyssey-continue="${id}"]`).click()
        if (id === 'unwritten') break
        await p.waitForTimeout(300); await shot(p, 'world-after-' + id); continue
      }
      assert.equal(s.phase, 'playing')
      if (s.crew.find(c => c.id === s.story.motherId).order !== 'engine') await p.getByRole('button', { name: 'Helm', exact: true }).click()
      if (s.crew.find(c => c.id === s.story.motherId).seat !== 'engine') { await p.waitForTimeout(250); continue }
      await steer(p, s.world.portal, s)
    }
    const finished = await state(p)
    assert.deepEqual(finished.odyssey.history, ['launch', 'flare', 'gate', 'dragon', 'unwritten']); assert.equal(finished.phase, 'won')
    await p.getByRole('button', { name: /Explore the living sea/ }).click()
    await p.waitForFunction(() => window.__STARLING__.snapshot().phase === 'playing')
    assert.equal((await state(p)).odyssey.stage, 'inner'); await shot(p, 'living-sea-freeplay')
    await p.getByRole('button', { name: 'Pause and settings', exact: true }).click(); await p.getByRole('button', { name: 'Save & return home', exact: true }).click(); await preparePack(p)
    await p2.context.setOffline(true); await p.reload(); await preparePack(p)
    await p.getByRole('button', { name: /Continue your voyage/ }).click(); await ready(p)
    assert.equal((await state(p)).odyssey.history.length, 5)
    await p.getByRole('button', { name: 'Open soundtrack controls', exact: true }).click()
    report.offlineTracks = []
    for (const [id, duration] of [['tides', 377.69], ['turn', 253.81], ['rope', 207.61], ['saltwake', 159.12], ['moonshot', 123.77], ['tiger', 19.97], ['hearts', 304.73]]) {
      await p.getByLabel('Choose theme song').selectOption(id)
      await p.waitForFunction(id => window.__STARLING__.stats().song.track === id && window.__STARLING__.stats().song.time > .5, id)
      const info = await p.evaluate(() => window.__STARLING__.stats().song)
      assert.ok(Math.abs(info.duration - duration) < .2); assert.equal(await p.evaluate(() => document.querySelector('audio').error), null)
      const seek = duration * .75
      await p.evaluate(t => { document.querySelector('audio').currentTime = t }, seek)
      await p.waitForFunction(t => document.querySelector('audio').currentTime > t + .2, seek)
      report.offlineTracks.push({ id, duration: info.duration, sought: seek })
    }
    const range = await p.evaluate(async () => { const r = await fetch(document.querySelector('audio').currentSrc, { headers: { Range: 'bytes=1000-1999' } }); return { status: r.status, bytes: (await r.arrayBuffer()).byteLength } })
    assert.deepEqual(range, { status: 206, bytes: 1000 }); report.offlineRange = range
    await p.getByRole('button', { name: 'Turn music off', exact: true }).click()
    await p.reload(); await preparePack(p); await p.getByRole('button', { name: /Continue your voyage/ }).click(); await ready(p)
    assert.equal((await p.evaluate(() => window.__STARLING__.stats().song)).playing, false)
    report.offlineSavedChapterAndMute = true; await p2.context.close()
  }

  if (!process.env.CROSSING_SOLO_ONLY) {
    console.log('Two independent portrait phones, shared family roles and reconnect')
    const h = await phone('mother'), g = await phone('son'), host = h.page, guest = g.page
    await host.getByRole('button', { name: /Play together/ }).click(); await ready(host)
    await host.locator('[data-story-choice="wind"]').waitFor()
    const code = (await host.getByRole('button', { name: /Invite ·/ }).innerText()).match(/[A-Z2-9]{6}/)?.[0]; assert.ok(code)
    await guest.goto(url + '#/rescue/' + code); await preparePack(guest)
    await guest.getByRole('button', { name: 'Join ship', exact: true }).click(); await ready(guest)
    await guest.locator('[data-story-choice="wind"]').waitFor(); assert.ok(await guest.locator('[data-story-choice="wind"]').isDisabled())
    const joined = await state(guest), son = joined.story.sonId
    assert.equal(joined.crew.find(c => c.id === son).pet, false); assert.equal(joined.crew.filter(c => !c.pet).length, 2); assert.ok(joined.seamanship)
    await shot(host, 'coop-mother-opening'); await shot(guest, 'coop-finn-opening')
    await seaScene(host, await state(host)); await guest.locator('.story-dialog').waitFor({ state: 'hidden' })
    await guest.getByRole('button', { name: 'Cook', exact: true }).click()
    await host.waitForFunction(id => window.__STARLING__.snapshot().crew.find(c => c.id === id)?.seat === 'galley', son)
    await host.waitForFunction(() => window.__STARLING__.snapshot().meal.remaining > 0)
    const before = await state(host); await steer(host, { x: before.ship.x + 20, y: before.ship.y }, before)
    await host.waitForTimeout(500); assert.ok((await state(guest)).stats.travel > 0)
    await shot(host, 'coop-mother-helm'); await shot(guest, 'coop-finn-cooking')
    await guest.getByRole('button', { name: 'Pause and settings', exact: true }).click(); assert.ok(await guest.getByLabel('Sea difficulty').isDisabled())
    await g.context.setOffline(true); await guest.evaluate(() => dispatchEvent(new Event('offline'))); await host.waitForTimeout(700)
    await g.context.setOffline(false); await guest.evaluate(() => dispatchEvent(new Event('online')))
    await guest.waitForFunction(() => window.__STARLING__.stats().connected && window.__STARLING__.stats().status.startsWith('Online'), null, { timeout: 20000 })
    const restored = await state(guest); assert.equal(restored.story.sonId, son); assert.equal(restored.crew.filter(c => c.id === son).length, 1); assert.equal(restored.story.history[0].choice, 'wind')
    report.coop = { code, twoPortraitContexts: true, motherHelmSonCooking: true, sharedMeal: true, guestCannotChooseOrSetDifficulty: true, reconnectIdentityAndStory: true }
  }
  assert.deepEqual(report.errors, []); report.passed = true
} catch (e) {
  report.passed = false; report.failure = e.stack
  for (const [i, context] of contexts.entries()) for (const page of context.pages()) try { await shot(page, 'failure-' + i); report['failureState' + i] = { state: await state(page), stats: await page.evaluate(() => window.__STARLING__.stats()) } } catch {}
  throw e
} finally { await writeFile(resolve(evidence, 'crossing-journey-smoke.json'), JSON.stringify(report, null, 2)); await browser.close() }
