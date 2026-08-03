import { describe, expect, it } from 'vitest'
import {
  BALL_RADIUS,
  DEFAULT_TIME_LIMIT_TICKS,
  DUEL_COURT_LENGTH_SCALE,
  PAL_ARM_TICKS,
  PAL_ENERGY_MAX,
  PAL_ENERGY_REGEN_TICKS,
  buildMatchConfig,
  canSummonPal,
  createGame,
  palCoordinates,
  restartGame,
  stepGame,
  type GameState,
} from '../src'

function playing(): GameState {
  const state = createGame(buildMatchConfig({ humanPlayers: [{ id: 'human', name: 'Human' }], seed: 42 }))
  state.phase = 'playing'
  state.countdownTicks = 0
  state.serveTicks = 0
  return state
}

describe('Pal Duel simulation', () => {
  it('creates a vertical v2 duel with the approved match defaults', () => {
    const state = createGame(buildMatchConfig({ humanPlayers: [{ id: 'human', name: 'Human' }], seed: 9 }))
    expect(state.rulesetVersion).toBe(2)
    expect(state.config.scoreToWin).toBe(5)
    expect(state.config.timeLimitTicks).toBe(DEFAULT_TIME_LIMIT_TICKS)
    expect(state.config.courtLengthScale).toBe(DUEL_COURT_LENGTH_SCALE)
    expect(Object.values(state.players).map((player) => player.side)).toEqual(['bottom', 'top'])
    expect(Object.values(state.players).every((player) => player.palEnergy === 2)).toBe(true)
  })

  it('regenerates one energy pip every 3.5 active seconds', () => {
    const state = playing()
    const human = state.players.human!
    human.palEnergy = 0
    for (let tick = 0; tick < PAL_ENERGY_REGEN_TICKS - 1; tick += 1) stepGame(state, { human: { target: 0.5, summon: null } })
    expect(human.palEnergy).toBe(0)
    stepGame(state, { human: { target: 0.5, summon: null } })
    expect(human.palEnergy).toBe(1)
    expect(state.events).toContainEqual({ type: 'energyChanged', playerId: 'human', energy: 1, reason: 'regen' })
  })

  it('spends energy to summon an anchored Guard and arms it after 200ms', () => {
    const state = playing()
    state.serveTicks = 100
    const human = state.players.human!
    human.position = 0.72
    stepGame(state, { human: { target: 0.72, summon: 'guard' } })
    expect(human.palEnergy).toBe(0)
    expect(state.pals).toHaveLength(1)
    expect(state.pals[0]).toMatchObject({ type: 'guard', anchor: 0.72, ownerId: 'human' })
    for (let tick = 0; tick < PAL_ARM_TICKS; tick += 1) stepGame(state)
    expect(state.events.some((event) => event.type === 'palArmed')).toBe(true)
  })

  it('makes every Guard a one-hit helper', () => {
    const state = playing()
    state.serveTicks = 100
    stepGame(state, { human: { target: 0.5, summon: 'guard' } })
    for (let tick = 0; tick < PAL_ARM_TICKS; tick += 1) stepGame(state)
    state.serveTicks = 0
    const pal = state.pals[0]!
    const point = palCoordinates(pal)
    state.balls[0] = {
      id: 'ball-1', x: point.x, y: point.y - BALL_RADIUS - 0.002,
      vx: 0, vy: 0.9, radius: BALL_RADIUS, spin: 0, lastToucherId: null,
    }
    stepGame(state)
    expect(state.pals).toHaveLength(0)
    expect(state.events.some((event) => event.type === 'palHit' && event.palType === 'guard')).toBe(true)
    expect(state.balls[0]!.vy).toBeLessThan(0)
    expect(state.players.human!.palHits).toBe(1)
  })

  it('splits a hit Captain into two armed-later Hatchlings', () => {
    const state = playing()
    state.serveTicks = 100
    const human = state.players.human!
    human.palEnergy = PAL_ENERGY_MAX
    stepGame(state, { human: { target: 0.5, summon: 'captain' } })
    for (let tick = 0; tick < PAL_ARM_TICKS; tick += 1) stepGame(state)
    state.serveTicks = 0
    const captain = state.pals.find((pal) => pal.type === 'captain')!
    const point = palCoordinates(captain)
    state.balls[0] = {
      id: 'ball-1', x: point.x, y: point.y - BALL_RADIUS - 0.002,
      vx: 0, vy: 0.9, radius: BALL_RADIUS, spin: 0, lastToucherId: null,
    }
    stepGame(state)
    expect(state.pals.map((pal) => pal.type)).toEqual(['hatchling', 'hatchling'])
    expect(state.pals.every((pal) => pal.parentId === captain.id)).toBe(true)
  })

  it('enforces Captain reservation and the four-Pal field cap', () => {
    const state = playing()
    const human = state.players.human!
    human.palEnergy = PAL_ENERGY_MAX
    expect(canSummonPal(state, human, 'captain')).toBe(true)
    stepGame(state, { human: { target: 0.5, summon: 'captain' } })
    human.palEnergy = PAL_ENERGY_MAX
    stepGame(state, { human: { target: 0.4, summon: 'guard' } })
    human.palEnergy = PAL_ENERGY_MAX
    stepGame(state, { human: { target: 0.6, summon: 'guard' } })
    human.palEnergy = PAL_ENERGY_MAX
    expect(canSummonPal(state, human, 'guard')).toBe(false)
  })

  it('scores exactly one, clears Pals, and gives the defender comeback energy', () => {
    const state = playing()
    state.players.human!.palEnergy = 2
    stepGame(state, { human: { target: 0.5, summon: 'guard' } })
    state.rallyHits = 22
    const bottom = state.players.human!
    state.balls[0] = {
      id: 'ball-1', x: 0.02, y: 1.03, vx: 0, vy: 0.9,
      radius: BALL_RADIUS, spin: 0, lastToucherId: 'ai-2',
    }
    stepGame(state)
    expect(state.scores['team-1']).toBe(1)
    expect(state.pals).toHaveLength(0)
    expect(bottom.palEnergy).toBe(1)
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'score', points: 1, rallyHits: 22 }))
  })

  it('fills both energy meters for a tied final volley', () => {
    const state = playing()
    state.remainingTicks = 1
    state.players.human!.palEnergy = 0
    state.players['ai-2']!.palEnergy = 1
    stepGame(state)
    expect(state.overtime).toBe(true)
    expect(Object.values(state.players).every((player) => player.palEnergy === PAL_ENERGY_MAX)).toBe(true)
  })

  it('makes longitudinal travel physically one-third longer', () => {
    const long = playing()
    const short = structuredClone(long)
    short.config.courtLengthScale = 1
    for (const state of [long, short]) {
      state.balls[0] = { id: 'ball-1', x: 0.5, y: 0.5, vx: 0, vy: 0.8, radius: BALL_RADIUS, spin: 0, lastToucherId: null }
      stepGame(state)
    }
    const longDelta = long.balls[0]!.y - 0.5
    const shortDelta = short.balls[0]!.y - 0.5
    expect(shortDelta / longDelta).toBeCloseTo(DUEL_COURT_LENGTH_SCALE, 5)
  })

  it('restarts with energy, Pals, and score reset', () => {
    const state = playing()
    state.players.human!.palEnergy = 6
    stepGame(state, { human: { target: 0.5, summon: 'captain' } })
    state.scores['team-0'] = 4
    const fresh = restartGame(state, 100)
    expect(fresh.scores).toEqual({ 'team-0': 0, 'team-1': 0 })
    expect(fresh.pals).toEqual([])
    expect(fresh.players.human!.palEnergy).toBe(2)
  })
})
