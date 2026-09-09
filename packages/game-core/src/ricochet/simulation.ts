import { along, direction, distance, geometry, nearestHit, reflection } from './geometry'
import { LAUNCHER, RICOCHET_SCENES } from './scenes'
import type { FlightSegment, Point, RicochetGame, RicochetShot, ShotEvent } from './types'

export const SHOT_LIMIT_MS = 6400
const SPEED = .21, ANTICIPATION = 170, MAX_CONTACTS = 28
type Orb = { id: number; point: Point; direction: Point; at: number; transformed: boolean; size: number; bounces: number; contacts: number }

/** Literal recipes. No actor-dependent damage or hidden matching/score multipliers. */
export function comboName(game: RicochetGame): string | null {
  const { payload, reflector: { mode } } = game.setup
  if (mode === 'mirror') return null
  if (payload === 'burst') return mode === 'split' ? 'Triple fireworks!' : 'Supernova splash!'
  if (payload === 'pierce') return mode === 'split' ? 'Three-way starbeam!' : 'Tidal starbeam!'
  return mode === 'split' ? 'Three little comets!' : 'One mighty comet!'
}

/** A bounded, chronological event simulation. No wall-clock/RNG/animation dependence. */
export function simulateRicochet(game: RicochetGame): RicochetShot {
  const scene = RICOCHET_SCENES[game.scene]!, colliders = geometry(game), wideColliders = geometry(game, true)
  const payload = game.setup.payload, lens = game.setup.reflector.mode
  const rescued = new Set(game.rescued), newlyRescued = new Set<number>()
  const segments: FlightSegment[] = [], events: ShotEvent[] = [{ ...LAUNCHER, kind: 'launch', at: 0, size: 1, orb: 0 }]
  const queue: Orb[] = [{ id: 0, point: { ...LAUNCHER }, direction: direction(game.setup.aim), at: 130, transformed: false, size: 1, bounces: 0, contacts: 0 }]
  let nextId = 1, transformed = false, duration = 130
  const rescue = (id: number, at: number, orb: number) => {
    if (rescued.has(id)) return
    rescued.add(id); newlyRescued.add(id)
    events.push({ ...scene.targets[id]!, kind: 'rescue', target: id, at, size: 1, orb })
  }
  // Process the next collision in TIME order, not one entire child before its siblings.
  // This makes simultaneous split shots share rescues and collisions fairly.
  for (let step = 0; queue.length && step < MAX_CONTACTS * 4; step++) {
    const next = queue.map(orb => {
      const end = along(orb.point, orb.direction, Math.max(0, SHOT_LIMIT_MS - orb.at) * SPEED)
      const hit = nearestHit(orb.size > 1 ? wideColliders : colliders, orb.point, end,
        collider => collider.kind === 'target' && rescued.has(collider.id))
      const point = hit?.point ?? end
      return { orb, hit, point, at: orb.at + distance(orb.point, point) / SPEED }
    }).sort((a, b) => a.at - b.at || a.orb.id - b.orb.id)[0]!
    const { orb, hit, point, at } = next
    queue.splice(queue.indexOf(orb), 1)
    if (orb.at >= SHOT_LIMIT_MS || orb.contacts >= MAX_CONTACTS || orb.bounces >= 7) continue
    segments.push({ orb: orb.id, from: { ...orb.point }, to: point, start: orb.at, end: at,
      payload, transformed: orb.transformed, size: orb.size, bounces: orb.bounces })
    duration = Math.max(duration, at)
    if (!hit) continue
    orb.contacts++
    if (hit.collider.kind === 'target') {
      if (payload === 'burst') {
        const radius = orb.transformed && lens === 'focus' ? 80 : orb.transformed && lens === 'split' ? 31 : 43
        events.push({ ...point, kind: 'burst', at, size: radius, orb: orb.id })
        for (const target of scene.targets) if (!rescued.has(target.id) && distance(target, point) <= radius + 14 &&
          !nearestHit(colliders, point, target, collider => collider.kind !== 'wall')) rescue(target.id, at + 80, orb.id)
      } else {
        rescue(hit.collider.id, at, orb.id)
        if (payload === 'pierce') queue.push({ ...orb, at: at + .2, point: along(point, orb.direction, .05) })
      }
      continue
    }
    const reflected = reflection(orb.direction, hit.normal)
    if (hit.collider.kind === 'reflector' && !orb.transformed) {
      transformed = true
      const transformedAt = at + (lens === 'mirror' ? 60 : ANTICIPATION)
      events.push({ ...point, kind: lens === 'mirror' ? 'bounce' : lens, at, size: 1, orb: orb.id })
      const outgoing = Math.atan2(reflected.y, reflected.x) * 180 / Math.PI
      for (const offset of lens === 'split' ? [-23, 0, 23] : [0]) {
        const d = direction(outgoing + offset)
        queue.push({ ...orb, id: lens === 'split' ? nextId++ : orb.id, point: along(point, d, .08), direction: d,
          at: transformedAt, transformed: true, size: lens === 'focus' ? 1.9 : lens === 'split' ? .8 : 1, bounces: orb.bounces + 1 })
      }
    } else {
      events.push({ ...point, kind: 'bounce', at, size: orb.size, orb: orb.id })
      queue.push({ ...orb, point: along(point, reflected, .08), direction: reflected, at: at + 45, bounces: orb.bounces + 1 })
    }
    if (rescued.size === scene.targets.length) break
  }
  events.sort((a, b) => a.at - b.at || a.orb - b.orb || (a.target ?? -1) - (b.target ?? -1))
  duration = Math.min(SHOT_LIMIT_MS + 450, Math.max(duration, ...events.map(event => event.at)) + 450)
  return { segments, events, duration, rescued: [...newlyRescued].sort((a, b) => a - b),
    combo: transformed ? comboName(game) : null, transformed }
}

/** Show the approach and a short exit path, not every later bounce or rescue. */
export function ricochetPreview(game: RicochetGame): FlightSegment[] {
  const shot = simulateRicochet(game), spent = new Map<number, number>()
  return shot.segments.filter(segment => segment.bounces <= 1).flatMap(segment => {
    const used = spent.get(segment.orb) ?? 0, length = distance(segment.from, segment.to)
    if (segment.bounces === 0) return [segment]
    const remaining = 100 - used
    if (remaining <= 0) return []
    spent.set(segment.orb, used + length)
    const fraction = Math.min(1, remaining / length)
    return [{ ...segment, to: { x: segment.from.x + (segment.to.x - segment.from.x) * fraction,
      y: segment.from.y + (segment.to.y - segment.from.y) * fraction }, end: segment.start + (segment.end - segment.start) * fraction }]
  })
}
