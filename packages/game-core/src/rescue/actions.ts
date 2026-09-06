import type { RescueState, ShipUpgrade } from './types'
import { buyRescueUpgrade, dockRescueShip, recruitRescueCrew } from './campaign'
import { travelRescueDock } from './factory'

export type RescueAction = { kind: 'dock' | 'undock' | 'travel' } | { kind: 'upgrade'; upgrade: ShipUpgrade } | { kind: 'recruit'; crew: string }
export function validRescueAction(value: unknown): value is RescueAction {
  if (!value || typeof value !== 'object') return false
  const a = value as RescueAction
  return ['dock', 'undock', 'travel'].includes(a.kind) || a.kind === 'upgrade' && ['hull', 'drive', 'reactor', 'tractor'].includes(a.upgrade) || a.kind === 'recruit' && typeof a.crew === 'string' && a.crew.length <= 80
}
export function applyRescueAction(s: RescueState, action: RescueAction): RescueState | null {
  if (!validRescueAction(action)) return null
  if (action.kind === 'travel') return travelRescueDock(s)
  if (action.kind === 'dock') return dockRescueShip(s) ? s : null
  if (action.kind === 'undock' && s.docked) { s.docked = null; s.ship.invulnerable = 4; return s }
  if (action.kind === 'upgrade') return buyRescueUpgrade(s, action.upgrade) ? s : null
  if (action.kind === 'recruit') return recruitRescueCrew(s, action.crew) ? s : null
  return null
}
