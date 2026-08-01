import type { Side } from '@pongapp/game-core'

/** Rotate the shared world so this player's wall is always the bottom wall. */
export function courtRotationForSide(side: Side): number {
  if (side === 'left') return -Math.PI / 2
  if (side === 'right') return Math.PI / 2
  if (side === 'top') return Math.PI
  return 0
}

/**
 * Whether increasing this wall's simulation position moves right or left after
 * the court has been rotated for the local player's view.
 */
function logicalAxisScreenSign(side: Side, viewSide: Side): number {
  const rotation = courtRotationForSide(viewSide)
  const tangentX = side === 'top' || side === 'bottom' ? 1 : 0
  const tangentY = side === 'left' || side === 'right' ? 1 : 0
  const screenX = Math.cos(rotation) * tangentX - Math.sin(rotation) * tangentY
  return screenX < 0 ? -1 : 1
}

export function screenDirectionToLogical(direction: number, side: Side, viewSide: Side): number {
  return direction * logicalAxisScreenSign(side, viewSide)
}

export function screenFractionToLogical(fraction: number, side: Side, viewSide: Side): number {
  return logicalAxisScreenSign(side, viewSide) < 0 ? 1 - fraction : fraction
}
