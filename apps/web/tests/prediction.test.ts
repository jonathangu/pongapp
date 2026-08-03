import { describe, expect, it } from 'vitest'
import { buildMatchConfig, createGame } from '@pongapp/game-core'
import { advanceLocalPaddlePreview, ballPredictionEnabled, interpolatePosition, worldPredictionEnabled } from '../src/game/prediction'

function stateWith() {
  const state = createGame(buildMatchConfig({
    humanPlayers: [{ id: 'human', name: 'Human' }],
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

  it('interpolates a remote paddle between buffered snapshots', () => {
    expect(interpolatePosition(0.2, 0.8, 0.5)).toBeCloseTo(0.5)
    expect(interpolatePosition(0.2, 0.8, -1)).toBeCloseTo(0.2)
    expect(interpolatePosition(0.2, 0.8, 2)).toBeCloseTo(0.8)
  })

  it('keeps local paddle motion continuous across stale server snapshots', () => {
    let preview = 0.5
    for (let frame = 0; frame < 8; frame += 1) {
      const previous = preview
      // Simulate a server snapshot that is still behind the touch target.
      const server = 0.5 + Math.max(0, frame - 3) * 0.01
      preview = advanceLocalPaddlePreview(preview, server, 0.9, 1 / 60)
      expect(preview).toBeGreaterThan(previous)
    }
  })

  it('reconciles server drift gradually instead of snapping', () => {
    const preview = advanceLocalPaddlePreview(0.7, 0.5, 0.7, 1 / 60)
    expect(preview).toBeLessThan(0.7)
    expect(preview).toBeGreaterThan(0.65)
  })
})
