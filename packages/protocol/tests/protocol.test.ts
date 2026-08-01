import { describe, expect, it } from 'vitest'
import { createRoomRequestSchema, parseWireMessage, PROTOCOL_VERSION } from '../src'

describe('protocol', () => {
  it('accepts bounded room configuration', () => {
    expect(createRoomRequestSchema.safeParse({
      mode: 'arena',
      itemIntensity: 'standard',
      mutator: 'bigBall',
      aiDifficulty: 'rally',
      aiSlots: 2,
      hostName: 'Jonathan',
      hostAbility: 'dash',
    }).success).toBe(true)
  })

  it('keeps old room requests compatible by defaulting the mutator', () => {
    const parsed = createRoomRequestSchema.parse({
      mode: 'duel',
      itemIntensity: 'off',
      aiDifficulty: 'rookie',
      aiSlots: 1,
      hostName: 'Player One',
      hostAbility: 'dash',
    })
    expect(parsed.mutator).toBe('none')
  })

  it('rejects incompatible clients and invalid input', () => {
    expect(parseWireMessage(JSON.stringify({
      type: 'hello',
      version: PROTOCOL_VERSION + 1,
      guestId: 'guest-12345678',
      displayName: 'Player',
      ability: 'dash',
      role: 'player',
    }))).toBeNull()
    expect(parseWireMessage('{broken')).toBeNull()
  })
})
