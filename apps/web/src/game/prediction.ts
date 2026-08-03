import { PADDLE_SPEED, type GameState } from '@pongapp/game-core'

const MIN_POSITION = 0.08
const MAX_POSITION = 0.92
const clampPosition = (value: number) => Math.min(MAX_POSITION, Math.max(MIN_POSITION, value))

export function worldPredictionEnabled(state: GameState): boolean {
  return state.phase !== 'finished' && state.freezeTicks <= 0
}

export function ballPredictionEnabled(state: GameState): boolean {
  return worldPredictionEnabled(state) && state.phase === 'playing' && state.serveTicks <= 0
}

export function advanceLocalPaddlePreview(
  current: number,
  authoritative: number,
  target: number,
  deltaSeconds: number,
): number {
  const delta = Math.min(0.05, Math.max(0, deltaSeconds))
  const maximumMove = PADDLE_SPEED * delta
  const movement = Math.min(maximumMove, Math.max(-maximumMove, target - current))
  const predicted = clampPosition(current + movement)
  const correction = (authoritative - predicted) * Math.min(1, delta * 6)
  return clampPosition(predicted + correction)
}

export function interpolatePosition(from: number, to: number, amount: number): number {
  return clampPosition(from + (to - from) * Math.min(1, Math.max(0, amount)))
}
