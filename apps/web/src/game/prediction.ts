import type { GameState } from '@pongapp/game-core'

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
