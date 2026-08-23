import type { Side } from '@pongapp/game-core'

export interface CourtPoint { x: number; y: number }

/** A top-seat player sees the authoritative court rotated by half a turn. */
export function courtRotationForSide(side: Side): number { return side === 'top' ? Math.PI : 0 }

export function screenPointToWorld(point: CourtPoint, viewSide: Side): CourtPoint {
  return viewSide === 'top' ? { x: 1 - point.x, y: 1 - point.y } : point
}

export function screenVectorToWorld(vector: CourtPoint, viewSide: Side): CourtPoint {
  return viewSide === 'top' ? { x: -vector.x, y: -vector.y } : vector
}

/** Keep a touch-controlled mallet visibly ahead of the player's thumb. */
export function visiblePointerTarget(finger: CourtPoint, playerSide: Side, viewSide: Side, courtHeight: number, isTouch: boolean): CourtPoint {
  if (!isTouch) return finger
  const lead = Math.min(80, Math.max(48, courtHeight * 0.1)) / Math.max(1, courtHeight)
  return {
    x: finger.x,
    y: Math.max(0, Math.min(1, finger.y + (playerSide === viewSide ? -lead : lead))),
  }
}
