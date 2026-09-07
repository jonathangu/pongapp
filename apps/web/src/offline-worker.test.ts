import { expect, it, vi } from 'vitest'
import { currentOfflineWorker } from './offline-worker'
it('uses the current registration even when the page controller is an old worker', async () => {
  const old = { state: 'redundant' }, active = { state: 'activated', postMessage: vi.fn() }
  const getRegistration = vi.fn().mockResolvedValue({ active })
  const container = { controller: old, getRegistration } as unknown as ServiceWorkerContainer
  expect(await currentOfflineWorker(container, '/pongapp/')).toBe(active)
  expect(getRegistration).toHaveBeenCalledWith('/pongapp/')
  getRegistration.mockResolvedValue({ active: old })
  expect(await currentOfflineWorker(container, '/pongapp/')).toBeNull()
})
