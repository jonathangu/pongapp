import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { installedContext, preparePack } from './starling-installed-harness.mjs'

const url = process.env.GODOT_SITE_URL || 'http://127.0.0.1:5173/pongapp/'
const evidence = resolve(process.env.GODOT_EVIDENCE || 'artifacts/save-transfer')
await mkdir(evidence, { recursive: true })
const original = await readFile(process.env.STORY_ENDING_SAVE, 'utf8')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { runtimeSession: '01a0369d-0914-7190-ac0e-b4d37e1fc052', url, standalone: 'emulated', errors: [] }
const raw = page => page.evaluate(() => localStorage.getItem('starling-rescue.save.v2'))
try {
  const legacy = await browser.newContext({ viewport: { width: 320, height: 740 }, acceptDownloads: true, reducedMotion: 'reduce' })
  await legacy.addInitScript(save => localStorage.setItem('starling-rescue.save.v2', save), original)
  const p = await legacy.newPage(); p.on('pageerror', e => report.errors.push(e.message))
  await p.goto(url); await p.getByRole('button', { name: /Install & prepare/ }).waitFor()
  assert.equal(await p.getByRole('button', { name: /Play solo/ }).count(), 0)
  const downloaded = p.waitForEvent('download'); await p.getByRole('button', { name: 'Download your voyage save' }).click()
  const backup = resolve(evidence, 'exported-voyage.json'); await (await downloaded).saveAs(backup)
  const exported = JSON.parse(await readFile(backup, 'utf8'))
  assert.deepEqual(exported.state.story.history, JSON.parse(original).state.story.history)
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await p.screenshot({ path: resolve(evidence, 'backup-before-install-320.png') })
  report.exportBeforeInstall = true
  await legacy.close()

  const installed = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); await installedContext(installed)
  const page = await installed.newPage(); page.on('pageerror', e => report.errors.push(e.message))
  await page.goto(url)
  await page.getByText('Keep or restore a voyage', { exact: true }).click()
  await page.getByLabel('Choose a voyage file').setInputFiles(backup)
  assert.equal(await raw(page), null, 'Selecting a file must not write storage')
  await page.getByRole('button', { name: 'Use this voyage save' }).click()
  assert.equal(JSON.parse(await raw(page)).state.story.history.length, 8)
  const saved = await raw(page)
  await page.getByLabel('Choose a voyage file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
  await page.getByText('This is not a supported Starling voyage. Your current save is unchanged.').waitFor()
  assert.equal(await raw(page), saved)
  await page.getByLabel('Choose a voyage file').setInputFiles({ name: 'oversize.json', mimeType: 'application/json', buffer: Buffer.alloc(512001, 32) })
  await page.getByText('This file is too large to be a Starling voyage. Your current save is unchanged.').waitFor()
  assert.equal(await raw(page), saved)
  const alternate = JSON.parse(saved); alternate.state.campaign.salvage++
  const payload = { name: 'another-voyage.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(alternate)) }
  await page.getByLabel('Choose a voyage file').setInputFiles(payload)
  await page.getByRole('button', { name: 'Replace this device’s saved voyage' }).waitFor()
  assert.equal(await raw(page), saved)
  await page.getByRole('button', { name: 'Cancel restore' }).click(); assert.equal(await raw(page), saved)
  await page.getByLabel('Choose a voyage file').setInputFiles(payload)
  await page.getByRole('button', { name: 'Replace this device’s saved voyage' }).click()
  assert.equal(JSON.parse(await raw(page)).state.campaign.salvage, alternate.state.campaign.salvage)
  await page.screenshot({ path: resolve(evidence, 'restored-in-installed-context-390.png') })
  await preparePack(page)
  await page.getByRole('button', { name: /Continue your voyage/ }).click()
  await page.waitForFunction(() => window.__STARLING__?.stats().frames > 45, null, { timeout: 45000 })
  await page.getByRole('button', { name: /Part II · Lift into the sky/ }).waitFor()
  assert.equal(await page.evaluate(() => window.__STARLING__.snapshot().story.history.length), 8)
  report.restoreAcrossSeparateContexts = true; report.invalidAndOversizedSafe = true; report.explicitReplacementOnly = true; report.oldVoyageCanEnterPartII = true
  assert.deepEqual(report.errors, []); report.passed = true
} catch (error) { report.passed = false; report.failure = error.stack; throw error }
finally { await writeFile(resolve(evidence, 'save-transfer-browser-smoke.json'), JSON.stringify(report, null, 2)); await browser.close() }
