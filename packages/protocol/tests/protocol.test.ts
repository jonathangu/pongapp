import { describe, expect, it } from 'vitest'
import { createRoomRequestSchema, parseWireMessage, PROTOCOL_VERSION } from '../src'

describe('Pal Duel protocol v2', () => {
  it('accepts the deliberately small room request', () => {
    expect(createRoomRequestSchema.parse({ hostName: 'Jonathan' })).toEqual({ hostName: 'Jonathan' })
  })

  it('rejects legacy room configuration instead of silently retaining it', () => {
    expect(createRoomRequestSchema.safeParse({
      hostName: 'Jonathan',
      mode: 'arena',
      itemIntensity: 'wild',
      hostAbility: 'dash',
    }).success).toBe(false)
  })

  it('accepts typed Pal commands and rejects incompatible clients', () => {
    expect(parseWireMessage(JSON.stringify({
      type: 'input', seq: 3, target: 0.7, summon: 'striker',
    }))).toEqual({ type: 'input', seq: 3, target: 0.7, summon: 'striker' })
    expect(parseWireMessage(JSON.stringify({
      type: 'hello', version: PROTOCOL_VERSION - 1,
      guestId: 'guest-12345678', displayName: 'Player', role: 'player',
    }))).toBeNull()
    expect(parseWireMessage('{broken')).toBeNull()
  })
})
