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
