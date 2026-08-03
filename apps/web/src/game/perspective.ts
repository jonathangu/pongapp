import type { Side } from '@pongapp/game-core'

/** A top-seat player sees the authoritative court rotated by half a turn. */
export function courtRotationForSide(side: Side): number {
  return side === 'top' ? Math.PI : 0
}

export function screenDirectionToLogical(direction: number, _side: Side, viewSide: Side): number {
  return viewSide === 'top' ? -direction : direction
}

export function screenFractionToLogical(fraction: number, _side: Side, viewSide: Side): number {
  return viewSide === 'top' ? 1 - fraction : fraction
}
