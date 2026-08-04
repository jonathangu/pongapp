import { MALLET_SPEED, RAIL_INSET, type GameState } from '@pongapp/game-core'
import type { CourtPoint } from './perspective'

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

export function worldPredictionEnabled(state: GameState): boolean {
  return state.phase !== 'finished' && state.freezeTicks <= 0
}

export function ballPredictionEnabled(state: GameState): boolean {
  const ball = state.balls[0]
  return worldPredictionEnabled(state) && state.phase === 'playing' && state.serveTicks <= 0 && !ball?.carrierPalId
}

export function advanceLocalMalletPreview(
  current: CourtPoint,
  authoritative: CourtPoint,
  target: CourtPoint,
  deltaSeconds: number,
  courtLengthScale: number,
): CourtPoint {
  const delta = Math.min(0.05, Math.max(0, deltaSeconds))
  const dx = target.x - current.x
  const dy = (target.y - current.y) * courtLengthScale
  const distance = Math.hypot(dx, dy)
  const amount = distance > 0 ? Math.min(1, MALLET_SPEED * delta / distance) : 0
  const predicted = { x: current.x + dx * amount, y: current.y + dy * amount / courtLengthScale }
  const correction = Math.min(1, delta * 6)
  return {
    x: clamp(predicted.x + (authoritative.x - predicted.x) * correction, RAIL_INSET, 1 - RAIL_INSET),
    y: clamp(predicted.y + (authoritative.y - predicted.y) * correction, RAIL_INSET, 1 - RAIL_INSET),
  }
}

export function interpolatePoint(from: CourtPoint, to: CourtPoint, amount: number): CourtPoint {
  const t = Math.min(1, Math.max(0, amount))
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}
