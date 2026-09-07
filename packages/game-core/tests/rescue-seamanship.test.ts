import { describe, expect, it } from 'vitest'
import { advanceRescueGame, advanceSeamanship, applyRescueAction, createRescueGame, damageRescueShip, decodeRescueSave, encodeRescueSave, learningToSail, neutralRescueInput, rescueTarget, restartRescueGame, validRescueAction } from '../src/rescue'

describe('an authoritative gentle first crossing', () => {
  it('does not strand a crewmate when a phone player repeatedly taps the same job', () => {
    const s = createRescueGame({ guided: true })
    for (let seq = 0; seq < 600; seq++) {
      const input = neutralRescueInput(); input.seq = seq; input.assist = true
      if (seq % 6 === 0) { input.command = 'engine'; input.commandCrew = 'captain' }
      advanceRescueGame(s, { captain: input })
    }
    expect(s.crew.find(p => p.id === 'captain')?.seat).toBe('engine')
  })
  it('keeps legacy games unchanged and validates optional learning saves', () => {
    const old = createRescueGame({ story: true })
    expect(old.seamanship).toBeUndefined(); expect(decodeRescueSave(encodeRescueSave(old))).not.toBeNull()
    const next = createRescueGame({ story: true, guided: true })
    expect(next.seamanship).toEqual({ step: 0, difficulty: 'gentle', travelStart: 0 })
    expect(decodeRescueSave(encodeRescueSave(next))?.seamanship).toEqual(next.seamanship)
    next.seamanship!.step = 6; expect(decodeRescueSave(JSON.stringify({ format: 'starling-rescue', version: 2, state: next }))).toBeNull()
  })
  it('waits for actions without timer pressure, damage, storms or hostile waves', () => {
    const s = createRescueGame({ guided: true }); const input = neutralRescueInput(); input.assist = true
    for (let i = 0; i < 12000; i++) advanceRescueGame(s, { captain: input })
    expect(s.seamanship!.step).toBe(0); expect(s.enemies).toHaveLength(0)
    expect(s.weather.strike).toBeNull(); expect(s.weather.intensity).toBe(0)
    damageRescueShip(s, 100, 0, 0); expect(s.ship.hp).toBe(s.ship.maxHp)
  })
  it('teaches steering, approach, cannon, pickup and cooking from shared observed state', () => {
    const s = createRescueGame({ guided: true }), player = s.crew.find(p => !p.pet)!
    advanceSeamanship(s); expect(s.seamanship!.step).toBe(0)
    player.seat = 'engine'; s.stats.travel = 6; advanceSeamanship(s); expect(s.seamanship!.step).toBe(1)
    const cage = rescueTarget(s)!; s.ship.x = cage.x; s.ship.y = cage.y - 12
    advanceSeamanship(s); expect(s.seamanship!.step).toBe(2)
    player.seat = 'east'; advanceSeamanship(s); expect(s.seamanship!.step).toBe(3)
    cage.open = true; advanceSeamanship(s); expect(s.seamanship!.step).toBe(3)
    cage.rescued = true; s.stats.rescues = 1; advanceSeamanship(s); expect(s.seamanship!.step).toBe(4)
    player.seat = 'galley'; s.meal.progress = 2; advanceSeamanship(s); expect(s.seamanship!.step).toBe(4)
    s.meal.remaining = 75; advanceSeamanship(s); expect(s.seamanship!.step).toBe(5)
    expect(learningToSail(s)).toBe(false); expect(s.nextWave).toBe(s.time + 30)
  })
  it('lets a second human contribute instead of requiring one player to do everything', () => {
    const s = createRescueGame({ guided: true, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] })
    s.seamanship!.step = 2; s.crew[1]!.seat = 'west'; advanceSeamanship(s)
    expect(s.seamanship!.step).toBe(3)
  })
  it('uses half, normal and harder damage only after practice', () => {
    const s = createRescueGame({ guided: true }); s.seamanship!.step = 5
    damageRescueShip(s, 2, 0, 0); expect(s.ship.hp).toBe(11)
    s.ship.invulnerable = 0; applyRescueAction(s, { kind: 'difficulty', difficulty: 'adventure' })
    damageRescueShip(s, 2, 0, 0); expect(s.ship.hp).toBe(9)
    s.ship.invulnerable = 0; applyRescueAction(s, { kind: 'difficulty', difficulty: 'tempest' })
    damageRescueShip(s, 2, 0, 0); expect(s.ship.hp).toBe(6)
  })
  it('rejects invented difficulties and extra tutorial fields', () => {
    expect(validRescueAction({ kind: 'difficulty', difficulty: 'immortal' })).toBe(false)
    expect(validRescueAction({ kind: 'tutorial', mode: 'skip', step: 100 })).toBe(false)
    expect(validRescueAction({ kind: 'tutorial', mode: 'skip' })).toBe(true)
  })
  it('persists difficulty and completed lessons into the next crossing', () => {
    const s = createRescueGame({ guided: true }); s.seamanship!.step = 5; s.seamanship!.difficulty = 'tempest'
    const next = restartRescueGame(s, true)
    expect(next.seamanship).toEqual({ step: 5, difficulty: 'tempest', travelStart: 0 })
    expect(decodeRescueSave(encodeRescueSave(next))?.seamanship).toEqual(next.seamanship)
  })
  it('makes replay and skip explicit, with a fresh travel baseline', () => {
    const s = createRescueGame(); s.stats.travel = 500
    applyRescueAction(s, { kind: 'tutorial', mode: 'replay' })
    expect(s.seamanship).toEqual({ step: 0, difficulty: 'gentle', travelStart: 500 })
    s.crew[0]!.seat = 'engine'; advanceSeamanship(s); expect(s.seamanship!.step).toBe(0)
    applyRescueAction(s, { kind: 'tutorial', mode: 'skip' }); expect(s.seamanship!.step).toBe(5)
  })
})
