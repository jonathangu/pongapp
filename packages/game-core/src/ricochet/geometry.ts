import { Box, Circle, Edge, Transform, Vec2, type Shape } from 'planck'
import { MIRROR_HALF, RICOCHET_SCENES } from './scenes'
import type { Point, RicochetGame } from './types'

/** Planck 1.5.0 MIT shape queries; no second integrator or hand-written collision solver.
 * Shapes are fixed during a shot. Stable iteration breaks equal-distance corner ties.
 * Preview and server resolution both call this adapter. */
export type Collider = { kind: 'wall' | 'reflector' | 'target'; id: number; shape: Shape; transform: Transform }
export type Hit = { collider: Collider; point: Point; normal: Point; fraction: number }
export const radians = (degrees: number) => degrees * Math.PI / 180
export const direction = (angle: number): Point => ({ x: Math.cos(radians(angle)), y: Math.sin(radians(angle)) })
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
export const along = (p: Point, d: Point, amount: number): Point => ({ x: p.x + d.x * amount, y: p.y + d.y * amount })
export function reflection(d: Point, normal: Point): Point {
  const dot = d.x * normal.x + d.y * normal.y
  return { x: d.x - 2 * dot * normal.x, y: d.y - 2 * dot * normal.y }
}
export function geometry(game: RicochetGame, wide = false): Collider[] {
  const scene = RICOCHET_SCENES[game.scene]!, mirror = game.setup.reflector
  const result: Collider[] = [{ kind: 'reflector', id: 0, shape: new Box(MIRROR_HALF, 3), transform: new Transform(mirror, radians(mirror.angle)) }]
  for (const [id, reef] of scene.reefs.entries()) result.push({ kind: 'wall', id,
    shape: new Box(distance(reef.a, reef.b) / 2, 7), transform: new Transform({ x: (reef.a.x + reef.b.x) / 2, y: (reef.a.y + reef.b.y) / 2 }, Math.atan2(reef.b.y - reef.a.y, reef.b.x - reef.a.x)) })
  for (const [id, [a, b]] of [[{ x: 12, y: 24 }, { x: 348, y: 24 }], [{ x: 348, y: 24 }, { x: 348, y: 414 }],
    [{ x: 348, y: 414 }, { x: 12, y: 414 }], [{ x: 12, y: 414 }, { x: 12, y: 24 }]].entries()) {
    result.push({ kind: 'wall', id: 100 + id, shape: new Edge(a!, b!), transform: new Transform() })
  }
  for (const target of scene.targets) result.push({ kind: 'target', id: target.id,
    shape: new Circle(14 + (wide ? 12 : 0)), transform: new Transform(target) })
  return result
}
export function nearestHit(colliders: Collider[], from: Point, to: Point, skip: (c: Collider) => boolean = () => false): Hit | null {
  let hit: Hit | null = null
  const output = { normal: new Vec2(), fraction: 0 }
  for (const collider of colliders) {
    if (skip(collider) || !collider.shape.rayCast(output, { p1: from, p2: to, maxFraction: 1 }, collider.transform, 0)) continue
    if (output.fraction < .000001 || hit && output.fraction >= hit.fraction - .000001) continue
    hit = { collider, fraction: output.fraction, normal: { ...output.normal },
      point: { x: from.x + (to.x - from.x) * output.fraction, y: from.y + (to.y - from.y) * output.fraction } }
  }
  return hit
}
