// Automated display-mode emulation is explicit; this is not physical-phone install evidence.
export async function installedContext(context) {
  await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }))
}
export async function preparePack(page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 20000 })
  await page.waitForFunction(() => {
    const status = document.querySelector('.sr-pack-actions [role="status"]')
    return status && !status.textContent.includes('Checking offline storage')
  }, null, { timeout: 20000 })
  // The status message can arrive before the network manifest. Wait until the
  // app actually offers a prepared voyage or an enabled download, not a transient count.
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => !b.disabled && (/^Download (offline|updated) pack/.test(b.textContent) || /Play solo/.test(b.textContent))), null, { timeout: 30000 })
  const download = page.getByRole('button', { name: /^Download (offline|updated) pack/ })
  if (await download.count()) await download.click()
  await page.getByRole('button', { name: /Play solo/ }).waitFor({ timeout: 180000 })
}
