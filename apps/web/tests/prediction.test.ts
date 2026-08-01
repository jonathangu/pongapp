import { describe, expect, it } from 'vitest'
import { buildMatchConfig, createGame } from '@pongapp/game-core'
import { ballPredictionEnabled, predictedHumanTarget, worldPredictionEnabled } from '../src/game/prediction'

function stateWith(mutator: 'none' | 'mirroredControls' = 'none') {
  const state = createGame(buildMatchConfig({
    mode: 'duel',
    humanPlayers: [{ id: 'human', name: 'Human' }],
    itemIntensity: 'off',
    mutator,
    seed: 9,
  }))
  state.phase = 'playing'
  state.serveTicks = 0
  return state
}

describe('render prediction', () => {
  it('stops every predictor during authoritative hitstop', () => {
    const state = stateWith()
    expect(worldPredictionEnabled(state)).toBe(true)
    expect(ballPredictionEnabled(state)).toBe(true)
    state.freezeTicks = 3
    expect(worldPredictionEnabled(state)).toBe(false)
    expect(ballPredictionEnabled(state)).toBe(false)
  })

  it('previews mirrored controls on the same side the server will choose', () => {
    expect(predictedHumanTarget(stateWith('mirroredControls'), 0.2)).toBeCloseTo(0.8)
    expect(predictedHumanTarget(stateWith(), 0.2)).toBeCloseTo(0.2)
  })
})
