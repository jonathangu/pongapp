import { describe, expect, it } from 'vitest'
import { createRoomRequestSchema, parseWireMessage, PROTOCOL_VERSION } from '../src'

describe('Pal Duel air-hockey protocol v3', () => {
  it('accepts the deliberately small room request', () => {
    expect(createRoomRequestSchema.parse({ hostName: 'Jonathan' })).toEqual({ hostName: 'Jonathan' })
    expect(createRoomRequestSchema.parse({ hostName: 'Jonathan', roomName: "Jonathan's Arena" })).toEqual({
      hostName: 'Jonathan', roomName: "Jonathan's Arena",
    })
    expect(createRoomRequestSchema.safeParse({ hostName: 'Jonathan', roomName: 'A' }).success).toBe(false)
  })

  it('rejects legacy room configuration instead of retaining dead modes', () => {
    expect(createRoomRequestSchema.safeParse({ hostName: 'Jonathan', mode: 'arena' }).success).toBe(false)
  })

  it('accepts two-dimensional Pal commands and rejects incompatible clients', () => {
    expect(parseWireMessage(JSON.stringify({
      type: 'input', seq: 3, targetX: 0.7, targetY: 0.3, palAction: 'striker',
    }))).toEqual({ type: 'input', seq: 3, targetX: 0.7, targetY: 0.3, palAction: 'striker' })
    expect(parseWireMessage(JSON.stringify({
      type: 'hello', version: PROTOCOL_VERSION - 1,
      guestId: 'guest-12345678', displayName: 'Player', role: 'player',
    }))).toBeNull()
    expect(parseWireMessage('{broken')).toBeNull()
  })
})
