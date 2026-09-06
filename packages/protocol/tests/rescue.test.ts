import { describe, expect, it } from 'vitest'
import { createRescueGame, encodeRescueSave, neutralRescueInput } from '@pongapp/game-core'
import { encodeRescueMessage, mergeRescueFrame, parseRescueClientMessage, parseRescueRoomRequest, rescueFrame } from '../src/rescue'

describe('Starling versioned wire contract', () => {
  it('rejects incompatible versions, invalid inputs and overlarge messages', () => {
    const hello = { type: 'hello', version: 1, guestId: 'guest-12345678', name: 'Captain' }
    expect(parseRescueClientMessage(JSON.stringify(hello))).toEqual(hello)
    for (const change of [{ version: 2 }, { guestId: 'x' }, { name: '<script>' }, { token: 'short' }]) expect(parseRescueClientMessage(JSON.stringify({ ...hello, ...change }))).toBeNull()
    expect(parseRescueClientMessage(' '.repeat(3000))).toBeNull()
    expect(parseRescueClientMessage(JSON.stringify({ type: 'input', epoch: 1, input: { ...neutralRescueInput(), x: 99 } }))).toBeNull()
  })
  it('frames preserve immutable level data and quantize only the wire representation', () => {
    const s = createRescueGame(), exact = .123456789; s.ship.x = exact
    const frame = rescueFrame(s, {}, [], true)
    expect(frame.state).not.toHaveProperty('docks'); expect(frame.state).not.toHaveProperty('voyage')
    expect(frame.world).not.toHaveProperty('obstacles'); expect(frame.world).not.toHaveProperty('fog')
    const merged = mergeRescueFrame(s, JSON.parse(encodeRescueMessage(frame)))
    expect(merged.ship.x).toBe(.1235); expect(s.ship.x).toBe(exact)
    expect(merged.docks).toBe(s.docks); expect(merged.world.obstacles).toBe(s.world.obstacles)
    expect(merged.world.fog).toBe(s.world.fog)
  })
  it('accepts valid private saves and rejects malformed save or recipe keys', () => {
    const request = { name: 'Captain', guestId: 'guest-12345678', seed: 73599, biome: 0, save: encodeRescueSave(createRescueGame()) }
    expect(parseRescueRoomRequest(request)).not.toBeNull()
    expect(parseRescueRoomRequest({ ...request, save: '{}' })).toBeNull()
    expect(parseRescueRoomRequest({ ...request, voyageKey: 'remote-code' })).toBeNull()
  })
})
