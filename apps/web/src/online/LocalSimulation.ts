import { advanceCoopGame, advanceVersusGame, type CoopInput, type CrewStation, type CrewTap, type CrewUpgrade } from '@pongapp/game-core'
import type { OnlineGameState } from '@pongapp/protocol'

export interface CrewControl { steer: number; action: boolean; station: CrewStation | null; upgrade: CrewUpgrade | null; targetId: number | null; tap?: CrewTap }
export interface Control extends CrewControl { paddle: number; taps: number; flares: number; seq: number; stationSeq: number; upgradeSeq: number; leftTaps: number; rightTaps: number; shootTaps: number; recoverTaps: number }
export type Controls = Record<string, Control>
export const neutralControl = (): Control => ({ paddle: 0, taps: 0, flares: 0, seq: 0, steer: 0, action: false, station: null, upgrade: null, targetId: null, stationSeq: 0, upgradeSeq: 0, leftTaps: 0, rightTaps: 0, shootTaps: 0, recoverTaps: 0 })
const TAP_COUNTERS = { left: 'leftTaps', right: 'rightTaps', shoot: 'shootTaps', recover: 'recoverTaps' } as const
const COUNTERS = ['taps','flares','stationSeq','upgradeSeq','leftTaps','rightTaps','shootTaps','recoverTaps'] as const
export function applyCrewControl(control: Control, patch: Partial<CrewControl>): void {
  const { tap, ...levels } = patch
  if (tap) control[TAP_COUNTERS[tap]]++
  if (patch.station !== undefined) control.stationSeq++
  if (patch.upgrade !== undefined) control.upgradeSeq++
  Object.assign(control, levels); control.seq++
}
export function controlAdvances(previous: Control, next: Control): boolean {
  return next.seq >= previous.seq && COUNTERS.every(key => next[key] >= previous[key] && next[key] - previous[key] <= 64)
}

/** Counter-based actions survive dropped/duplicated packets and short taps. */
export function stepLocal(state: OnlineGameState, controls: Controls, consumed: Controls): void {
  const inputs: Record<string, CoopInput> = {}
  for (const [id, control] of Object.entries(controls)) {
    const previous = consumed[id] ?? neutralControl()
    const tap = control.taps > previous.taps
    const flare = control.flares > previous.flares
    const pulses = { leftTaps: control.leftTaps > previous.leftTaps, rightTaps: control.rightTaps > previous.rightTaps, shootTaps: control.shootTaps > previous.shootTaps, recoverTaps: control.recoverTaps > previous.recoverTaps }
    inputs[id] = { paddle: state.rulesetVersion === 6 ? (tap ? 1 : 0) : control.paddle, flare, steer: control.steer, action: control.action, targetId: control.targetId,
      leftTap: pulses.leftTaps, rightTap: pulses.rightTaps, shootTap: pulses.shootTaps, recoverTap: pulses.recoverTaps,
      station: control.stationSeq > previous.stationSeq ? control.station ?? undefined : undefined,
      upgrade: control.upgradeSeq > previous.upgradeSeq ? control.upgrade ?? undefined : undefined }
    if (state.rulesetVersion === 6 && tap && state.racers[id]) state.racers[id]!.lastPaddle = 0
    consumed[id] = { ...control, taps: previous.taps + (tap ? 1 : 0), flares: previous.flares + (flare ? 1 : 0),
      leftTaps: previous.leftTaps + Number(pulses.leftTaps), rightTaps: previous.rightTaps + Number(pulses.rightTaps), shootTaps: previous.shootTaps + Number(pulses.shootTaps), recoverTaps: previous.recoverTaps + Number(pulses.recoverTaps) }
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
    [c.seq, ...COUNTERS.map(key => c[key])].every((n) => Number.isSafeInteger(n) && n >= 0 && n < 10_000_000)
}
