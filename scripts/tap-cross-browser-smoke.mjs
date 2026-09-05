import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium, webkit } = await import(process.env.QA_PLAYWRIGHT ?? 'playwright')
const ui = process.env.UI_URL ?? 'http://127.0.0.1:5173/pongapp/'
const out = process.env.QA_OUTPUT ?? '/tmp/tap-cross-browser-qa'
await mkdir(out, { recursive: true })
const results = []
for (const engine of (process.env.QA_ENGINES ?? 'chromium,webkit').split(',')) {
  const browser = await (engine === 'chromium' ? chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }) : webkit.launch({ headless: true }))
  try {
    for (const [width, height] of [[320,568],[390,844],[844,390],[1440,900]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 600 ? 3 : 1, isMobile: width < 600, hasTouch: width < 900 })
      const page = await ctx.newPage(), errors = []
      page.on('pageerror', e => errors.push(e.message))
      await page.goto(ui, { waitUntil: 'load' }); await page.locator('.oars-launch--solo').click()
      await page.waitForFunction(() => document.querySelector('.crew-tap-grid') && !document.querySelector('.expedition-countdown'))
      await page.waitForFunction(() => document.querySelector('.expedition-canvas')?.dataset.renderer === 'webgl-3d', null, { timeout: 45000 })
      await page.evaluate(() => { const n = document.querySelector('.crew-game'); let f = n[Object.keys(n).find(k => k.startsWith('__reactFiber$'))]; while (f && !f.memoizedProps?.getState) f = f.return; window.qaProps = f.memoizedProps; const s = qaProps.getState(); s.objects = []; s.invulnerableTicks = 100000 })
      const press = async action => width < 900 ? page.locator('[data-action=' + action + ']').tap() : page.locator('[data-action=' + action + ']').click()
      for (let i = 0; i < 3; i++) await press('right')
      await page.waitForFunction(() => qaProps.getState().crew.actions['solo-human'].right === 3)
      await press('shoot')
      await page.waitForFunction(() => qaProps.getState().crew.actions['solo-human'].shoot === 1)
      await page.locator('[data-action=shoot]').focus()
      await page.keyboard.down('Space'); await page.keyboard.down('Space'); await page.keyboard.up('Space')
      await page.waitForTimeout(200)
      assert.equal(await page.evaluate(() => qaProps.getState().crew.actions['solo-human'].shoot), 2, 'Space hold with focused button counts once')
      await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter')
      await page.waitForTimeout(150)
      assert.equal(await page.evaluate(() => qaProps.getState().crew.actions['solo-human'].shoot), 3, 'Enter hold with focused button counts once')
      await page.evaluate(() => { const s = qaProps.getState(); s.hearts = 2; s.crew.scrap = 3; s.crew.repair = 0 })
      await page.waitForFunction(() => !document.querySelector('[data-action=recover]').disabled)
      for (let i = 0; i < 6; i++) await press('recover')
      await page.waitForFunction(() => qaProps.getState().hearts === 3)
      assert.equal(await page.evaluate(() => qaProps.getState().crew.scrap), 0)
      await page.locator('.crew-help-button').click(); assert.match(await page.locator('.crew-guide').textContent(), /6 repair taps/)
      await page.locator('.crew-guide>button').click()
      await page.locator('[aria-label="Zoom out"]').click()
      await page.waitForFunction(() => Number(document.querySelector('.expedition-canvas').dataset.zoom) < .9)
      await page.locator('[aria-label="Reset camera zoom"]').click()
      const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, buttons: [...document.querySelectorAll('.crew-tap,.crew-camera button,.crew-help-button')].map(n => { const r = n.getBoundingClientRect(); return { ...r.toJSON(), uncovered: n.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) } }) }))
      assert.equal(layout.overflow, false)
      assert.ok(layout.buttons.every(b => b.width >= 43 && b.height >= 43 && b.left >= 0 && b.right <= width + 1 && b.bottom <= height + 1 && b.uncovered))
      assert.equal(await page.locator('.crew-upgrades,dialog[open]').count(), 0)
      await page.screenshot({ path: out + '/' + engine + '-' + width + '.png' }); assert.deepEqual(errors, [])
      results.push({ engine, width, height, tapRepairZoomGuideLayout: 'passed', focusedSpaceRepeat: 'single action', errors })
      console.log('PASS', engine, width, height); await ctx.close()
    }
  } finally { await browser.close() }
}
await writeFile(out + '/results.json', JSON.stringify({ runtimeSession: '01a0369d-0914-7190-ac0e-b4d37e1fc052', ui, results, physicalPhoneVerified: false }, null, 2))
