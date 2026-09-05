import { describe, expect, it } from 'vitest'
import { inviteUrlFor, normalizeRoomCode } from '../src/online/invite'

describe('invite links', () => {
  it('normalizes a valid room code', () => {
    expect(normalizeRoomCode(' abcd29 ')).toBe('ABCD29')
    expect(normalizeRoomCode('invalid')).toBeNull()
  })

  it('routes co-op and versus guests directly into the right room', () => {
    expect(inviteUrlFor('https://www.jonathangu.com', '/pongapp/', 'ABC229', true, 'coop'))
      .toBe('https://www.jonathangu.com/pongapp/?quick=1#/room/ABC229')
    expect(inviteUrlFor('https://www.jonathangu.com', '/pongapp/', 'ABC229', false, 'versus'))
      .toBe('https://www.jonathangu.com/pongapp/#/race/ABC229')
  })
})
