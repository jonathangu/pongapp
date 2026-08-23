import { describe, expect, it } from 'vitest'
import { hasRoomInputToFlush, remoteInterpolationDelayTicks, shouldReconnectAfterClose } from '../src/online/RoomClient'

describe('room reconnect policy', () => {
  it('does not fight another tab after the server transfers the seat', () => {
    expect(shouldReconnectAfterClose(4001)).toBe(false)
  })

  it('retries ordinary network disconnects', () => {
    expect(shouldReconnectAfterClose(1006)).toBe(true)
  })

  it('does not flood the room with idle input packets', () => {
    expect(hasRoomInputToFlush(false, null)).toBe(false)
    expect(hasRoomInputToFlush(true, null)).toBe(true)
    expect(hasRoomInputToFlush(false, 'guard')).toBe(true)
  })

  it('uses a smaller remote interpolation buffer on a stable edge connection', () => {
    expect(remoteInterpolationDelayTicks('good', 34)).toBe(1.5)
    expect(remoteInterpolationDelayTicks('fair', 55)).toBe(2.5)
    expect(remoteInterpolationDelayTicks('poor', 110)).toBe(4)
  })
})
