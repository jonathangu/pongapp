import { advanceCoopGame, advanceVersusGame } from '@pongapp/game-core'
import type { OnlineGameState } from '@pongapp/protocol'

export interface Control { paddle: number; taps: number; flares: number; seq: number }
export type Controls = Record<string, Control>
export const neutralControl = (): Control => ({ paddle: 0, taps: 0, flares: 0, seq: 0 })

/** Counter-based actions survive dropped/duplicated packets and short taps. */
export function stepLocal(state: OnlineGameState, controls: Controls, consumed: Controls): void {
  const inputs: Record<string, { paddle: number; flare: boolean }> = {}
  for (const [id, control] of Object.entries(controls)) {
    const previous = consumed[id] ?? neutralControl()
    const tap = control.taps > previous.taps
    const flare = control.flares > previous.flares
    inputs[id] = { paddle: state.rulesetVersion === 6 ? (tap ? 1 : 0) : control.paddle, flare }
    if (state.rulesetVersion === 6 && tap && state.racers[id]) state.racers[id]!.lastPaddle = 0
    consumed[id] = { ...control, taps: previous.taps + (tap ? 1 : 0), flares: previous.flares + (flare ? 1 : 0) }
  }
  if (state.rulesetVersion === 6) advanceVersusGame(state, inputs)
  else advanceCoopGame(state, inputs)
}

export function validControl(value: unknown): value is Control {
  if (!value || typeof value !== 'object') return false
  const c = value as Control
  return Number.isFinite(c.paddle) && c.paddle >= 0 && c.paddle <= 1 &&
    [c.seq, c.taps, c.flares].every((n) => Number.isSafeInteger(n) && n >= 0 && n < 10_000_000)
}
