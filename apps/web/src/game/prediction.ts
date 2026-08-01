import { PADDLE_SPEED, type GameState } from '@pongapp/game-core'

const MIN_PADDLE_POSITION = 0.08
const MAX_PADDLE_POSITION = 0.92
const clampPosition = (value: number) => Math.min(MAX_PADDLE_POSITION, Math.max(MIN_PADDLE_POSITION, value))

/** Authoritative hitstop freezes paddles and balls; prediction must freeze too. */
export function worldPredictionEnabled(state: GameState): boolean {
  return state.phase !== 'finished' && (state.freezeTicks ?? 0) <= 0
}

export function ballPredictionEnabled(state: GameState): boolean {
  return worldPredictionEnabled(state) && state.phase === 'playing' && state.serveTicks <= 0
}

/** Mirror the client-side paddle preview by the same rule the server applies. */
export function predictedHumanTarget(state: GameState, target: number): number {
  return (state.config.mutator ?? 'none') === 'mirroredControls' ? 1 - target : target
}

/**
 * Advance the locally rendered paddle without ever re-anchoring it to a new
 * snapshot. The server position is only a soft correction; replacing `current`
 * with it each snapshot creates a visible back/forward sawtooth on real phones.
 */
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
  // Six corrections per second closes ordinary network drift quickly without
  // exposing the server's 20 Hz snapshot steps as paddle motion.
  const correction = (authoritative - predicted) * Math.min(1, delta * 6)
  return clampPosition(predicted + correction)
}
