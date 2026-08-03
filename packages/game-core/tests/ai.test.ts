import { describe, expect, it } from 'vitest'
import {
  PAL_ENERGY_MAX,
  aiInputs,
  buildMatchConfig,
  createAiMemory,
  createGame,
  predictCoordinateWithBounces,
} from '../src'

describe('Pal Duel AI', () => {
  it('limits prediction to the wall bounces a tier understands', () => {
    expect(predictCoordinateWithBounces(0.8, 1, 0.6, 0)).toBe(1)
    expect(predictCoordinateWithBounces(0.8, 1, 0.6, 1)).toBeCloseTo(0.6)
  })

  it('produces deterministic, bounded movement targets', () => {
    const state = createGame(buildMatchConfig({ humanPlayers: [{ id: 'human', name: 'Human' }], aiDifficulty: 'pro', seed: 4 }))
    state.phase = 'playing'
    state.countdownTicks = 0
    const one = aiInputs(state, createAiMemory())['ai-2']!
    const two = aiInputs(structuredClone(state), createAiMemory())['ai-2']!
    expect(one).toEqual(two)
    expect(one.target).toBeGreaterThanOrEqual(0.08)
    expect(one.target).toBeLessThanOrEqual(0.92)
  })

  it('uses the same energy-gated Captain as a human', () => {
    const state = createGame(buildMatchConfig({ humanPlayers: [{ id: 'human', name: 'Human' }], aiDifficulty: 'ace', seed: 7 }))
    state.phase = 'playing'
    state.countdownTicks = 0
    const ai = state.players['ai-2']!
    ai.palEnergy = PAL_ENERGY_MAX
    let summoned = false
    const memory = createAiMemory()
    for (let tick = 0; tick < 120; tick += 1) {
      state.tick = tick
      if (aiInputs(state, memory)['ai-2']?.summon === 'captain') {
        summoned = true
        break
      }
    }
    expect(summoned).toBe(true)
    ai.palEnergy = 0
    for (let tick = 0; tick < 120; tick += 1) {
      state.tick = tick
      expect(aiInputs(state, memory)['ai-2']?.summon).toBeNull()
    }
  })
})
