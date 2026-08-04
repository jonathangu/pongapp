import { describe, expect, it } from 'vitest'
import { PAL_ENERGY_MAX, aiInputs, buildMatchConfig, createAiMemory, createGame } from '../src'

describe('Pal Duel air-hockey AI', () => {
  it('produces deterministic, bounded two-dimensional targets', () => {
    const state = createGame(buildMatchConfig({ humanPlayers: [{ id: 'human', name: 'Human' }], aiDifficulty: 'pro', seed: 4 }))
    state.phase = 'playing'
    state.countdownTicks = 0
    const one = aiInputs(state, createAiMemory())['ai-2']!
    const two = aiInputs(structuredClone(state), createAiMemory())['ai-2']!
    expect(one).toEqual(two)
    expect(one.targetX).toBeGreaterThanOrEqual(0.07)
    expect(one.targetX).toBeLessThanOrEqual(0.93)
    expect(one.targetY).toBeGreaterThanOrEqual(0.07)
    expect(one.targetY).toBeLessThanOrEqual(0.93)
  })

  it('moves toward a puck threat in both axes rather than reading a fixed goal line', () => {
    const state = createGame(buildMatchConfig({ humanPlayers: [{ id: 'human', name: 'Human' }], aiDifficulty: 'rally', seed: 7 }))
    state.phase = 'playing'
    state.countdownTicks = 0
    state.balls[0]!.x = 0.78
    state.balls[0]!.y = 0.38
    state.balls[0]!.vx = 0.1
    state.balls[0]!.vy = -0.8
    const input = aiInputs(state, createAiMemory())['ai-2']!
    expect(input.targetX).toBeGreaterThan(0.5)
    expect(input.targetY).toBeGreaterThan(0.18)
  })

  it('sets up a bank shot instead of firing through a centred camping goalie', () => {
    const state = createGame(buildMatchConfig({ humanPlayers: [{ id: 'human', name: 'Human' }], aiDifficulty: 'rally', seed: 12 }))
    state.phase = 'playing'
    state.countdownTicks = 0
    state.serveTicks = 0
    state.players.human!.x = 0.5
    state.players.human!.y = 0.82
    state.balls[0]!.x = 0.42
    state.balls[0]!.y = 0.42
    state.balls[0]!.vx = 0
    state.balls[0]!.vy = 0.5
    const input = aiInputs(state, createAiMemory())['ai-2']!
    expect(input.targetX).toBeLessThan(state.balls[0]!.x)
    expect(input.targetY).toBeLessThan(state.balls[0]!.y)
  })

  it('uses the same six-energy Captain card as a human', () => {
    const state = createGame(buildMatchConfig({ humanPlayers: [{ id: 'human', name: 'Human' }], aiDifficulty: 'ace', seed: 7 }))
    state.phase = 'playing'
    state.countdownTicks = 0
    const ai = state.players['ai-2']!
    ai.palEnergy = PAL_ENERGY_MAX
    let called = false
    const memory = createAiMemory()
    for (let tick = 0; tick < 160; tick += 1) {
      state.tick = tick
      if (aiInputs(state, memory)['ai-2']?.palAction === 'captain') { called = true; break }
    }
    expect(called).toBe(true)
    ai.palEnergy = 0
    state.pals = []
    for (let tick = 0; tick < 120; tick += 1) {
      state.tick = tick
      expect(aiInputs(state, memory)['ai-2']?.palAction).not.toBe('captain')
    }
  })
})
