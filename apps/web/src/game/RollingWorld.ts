import { RIVER_WIDTH, orbitDelta, type RiverObject } from '@pongapp/game-core'

// Shared, dependency-free projection: WebGL and the instant Canvas fallback agree.
export const CYLINDER_RADIUS = 14
export const ROLLING_DEPTH = 22
export const worldRoll = (boatX: number) => (boatX - .5) * RIVER_WIDTH
export const followRoll = (roll:number,boatX:number,dt:number) => roll+orbitDelta(boatX-.5,roll/RIVER_WIDTH)*RIVER_WIDTH*(1-Math.exp(-Math.max(0,Math.min(100,dt))/80))
export function cylinderPoint(x: number, elevation: number, z: number, roll = 0) {
  const angle = (x - roll) / CYLINDER_RADIUS, radius = CYLINDER_RADIUS + elevation
  return { x: Math.sin(angle) * radius, y: Math.cos(angle) * radius - CYLINDER_RADIUS, z, angle }
}
export function rollingCamera(width: number, height: number) {
  const aspect = Math.max(.25, width / Math.max(1, height))
  const halfFov = Math.atan(Math.tan(35 * Math.PI / 180) / Math.max(1, aspect / .85))
  const basePitch = Math.max(10, Math.min(26, halfFov * 180 / Math.PI - 8)) * Math.PI / 180
  const pitch=basePitch+10*Math.PI/180
  // Tilt around the boat, preserving the former viewing distance rather than shrinking the action.
  const distance = 30 * Math.max(1,aspect/2.35)/Math.cos(basePitch+halfFov*.4)
  const z = .26 * ROLLING_DEPTH + distance*Math.cos(pitch+halfFov*.4), y = distance*Math.sin(pitch+halfFov*.4)
  return { aspect, halfFov, pitch, y, z, targetZ: z - y / Math.tan(pitch), depth: ROLLING_DEPTH }
}
/** Back-of-cylinder enemies must not be drawn by Canvas or selected through opaque terrain. */
export function orbitVisible(width:number,height:number,x:number,roll:number,elevation=0):boolean{
  const camera=rollingCamera(width,height),angle=((x-.5)*RIVER_WIDTH-roll)/CYLINDER_RADIUS
  return Math.cos(angle)*(CYLINDER_RADIUS+camera.y)>CYLINDER_RADIUS+elevation
}
export function projectRolling(width: number, height: number, x: number, y: number, elevation = 0, roll = 0) {
  const c = rollingCamera(width, height), p = cylinderPoint((x - .5) * RIVER_WIDTH, elevation, (y - .5) * c.depth, roll)
  const dy = p.y - c.y, dz = p.z - c.z
  const distance = Math.max(.1, -dy * Math.sin(c.pitch) - dz * Math.cos(c.pitch))
  const up = dy * Math.cos(c.pitch) - dz * Math.sin(c.pitch)
  const scale = height / (2 * Math.tan(c.halfFov) * distance)
  return [width / 2 + p.x * scale, height / 2 - up * scale] as [number, number]
}
/** Visual landing completes well before any object reaches the boat's collision row. */
export function skyDropHeight(object: RiverObject): number {
  if (object.type === 'predator' || object.type === 'gate') return 0
  const remaining = Math.max(0, Math.min(1, (.24 - object.y) / .32))
  return 9 * remaining * remaining
}
