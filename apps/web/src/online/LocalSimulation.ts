import { advanceCoopGame, advanceVersusGame, type CoopInput, type CrewStation, type CrewUpgrade } from '@pongapp/game-core'
import type { OnlineGameState } from '@pongapp/protocol'

export interface CrewControl { steer: number; action: boolean; station: CrewStation | null; upgrade: CrewUpgrade | null; targetId: number | null }
export interface Control extends CrewControl { paddle: number; taps: number; flares: number; seq: number; stationSeq: number; upgradeSeq: number }
export type Controls = Record<string, Control>
export const neutralControl = (): Control => ({ paddle: 0, taps: 0, flares: 0, seq: 0, steer: 0, action: false, station: null, upgrade: null, targetId: null, stationSeq: 0, upgradeSeq: 0 })

/** Counter-based actions survive dropped/duplicated packets and short taps. */
export function stepLocal(state: OnlineGameState, controls: Controls, consumed: Controls): void {
  const inputs: Record<string, CoopInput> = {}
  for (const [id, control] of Object.entries(controls)) {
    const previous = consumed[id] ?? neutralControl()
    const tap = control.taps > previous.taps
    const flare = control.flares > previous.flares
    inputs[id] = { paddle: state.rulesetVersion === 6 ? (tap ? 1 : 0) : control.paddle, flare, steer: control.steer, action: control.action, targetId: control.targetId,
      station: control.stationSeq > previous.stationSeq ? control.station ?? undefined : undefined,
      upgrade: control.upgradeSeq > previous.upgradeSeq ? control.upgrade ?? undefined : undefined }
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
    Number.isFinite(c.steer) && c.steer >= -1 && c.steer <= 1 && typeof c.action === 'boolean' &&
    (c.station === null || ['pilot','gunner','engineer'].includes(c.station)) &&
    (c.upgrade === null || ['chain','frost','twin','bubble','magnet'].includes(c.upgrade)) &&
    (c.targetId === null || Number.isSafeInteger(c.targetId) && c.targetId >= 0) &&
    [c.seq, c.taps, c.flares, c.stationSeq, c.upgradeSeq].every((n) => Number.isSafeInteger(n) && n >= 0 && n < 10_000_000)
}
