import { describe, expect, it } from 'vitest'
import { shouldReconnectAfterClose } from '../src/online/RoomClient'

describe('room reconnect policy', () => {
  it('does not fight another tab after the server transfers the seat', () => {
    expect(shouldReconnectAfterClose(4001)).toBe(false)
  })

  it('retries ordinary network disconnects', () => {
    expect(shouldReconnectAfterClose(1006)).toBe(true)
  })
})
