import { HULL_RADIUS, rescueRandom, type BiomeId, type RescueWorld, type RescueObstacle, type Vec } from './types'

export const RESCUE_BIOMES = [
  { name: 'The Luminous Reef', subtitle: 'A sea of stars. Five little lives.', tint: '#70e6d1', dark: '#081c35', accent: '#ffb184', creature: 'Glasswing Matriarch' },
  { name: 'The Clockwork Gardens', subtitle: 'Lost machines have a heartbeat, too.', tint: '#e9b877', dark: '#201b35', accent: '#ff85b0', creature: 'The Brass Leviathan' },
  { name: 'The Violet Tempest', subtitle: 'Bring everybody home.', tint: '#b4a0ff', dark: '#1b173f', accent: '#84f0e7', creature: 'Storm-Crown Oracle' },
] as const
export const FOG_COLUMNS = 28, FOG_ROWS = 25
export function segmentCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, radius: number): number | null {
  const dx = bx - ax, dy = by - ay, fx = ax - cx, fy = ay - cy
  const a = dx * dx + dy * dy, c = fx * fx + fy * fy - radius * radius
  if (c <= 0) return 0
  if (a < 1e-12) return null
  const b = 2 * (fx * dx + fy * dy), d = b * b - 4 * a * c
  if (d < 0) return null
  const t = (-b - Math.sqrt(d)) / (2 * a)
  return t >= 0 && t <= 1 ? t : null
}
export function pointSegmentDistance(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / Math.max(.001, dx * dx + dy * dy)))
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t)
}

export function rescueMapReachable(world: RescueWorld): boolean {
  const columns = 29, rows = 27, cellX = (world.width - HULL_RADIUS * 2 - 1) / (columns - 1), cellY = (world.height - HULL_RADIUS * 2 - 1) / (rows - 1)
  const point = (i: number) => ({ x: -world.width / 2 + HULL_RADIUS + .5 + (i % columns) * cellX, y: -world.height / 2 + HULL_RADIUS + .5 + Math.floor(i / columns) * cellY })
  const allowed = Array.from({ length: columns * rows }, (_, i) => {
    const p = point(i)
    return world.obstacles.every(o => Math.hypot(o.x - p.x, o.y - p.y) > HULL_RADIUS + o.radius + .15)
  })
  const nearest = (p: Vec) => {
    let best = -1, distance = Infinity
    for (let i = 0; i < allowed.length; i++) if (allowed[i]) { const n = point(i), d = Math.hypot(n.x - p.x, n.y - p.y); if (d < distance) { distance = d; best = i } }
    return best
  }
  const start = nearest({ x: 0, y: -24 }), queue = [start], seen = new Set(queue)
  while (queue.length) {
    const i = queue.shift()!, x = i % columns, y = Math.floor(i / columns)
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx! < 0 || nx! >= columns || ny! < 0 || ny! >= rows) continue
      const j = ny! * columns + nx!
      if (!allowed[j] || seen.has(j)) continue
      const a = point(i), b = point(j)
      if (world.obstacles.some(o => segmentCircle(a.x, a.y, b.x, b.y, o.x, o.y, o.radius + HULL_RADIUS + .1) !== null)) continue
      seen.add(j); queue.push(j)
    }
  }
  return [...world.cages, world.portal].every(p => { const n = nearest(p); return seen.has(n) && Math.hypot(point(n).x - p.x, point(n).y - p.y) < 5 })
}

export function createRescueWorld(seed: number, biome: BiomeId): RescueWorld {
  const rng = { seed: seed >>> 0 }, spawn = { x: 0, y: -24 }
  // Authored encounter anchors plus bounded seeded variation; guaranteed safe connected approach corridors.
  const anchors = [{ x: 10, y: -5 }, { x: -25, y: 8 }, { x: 30, y: 15 }, { x: -26, y: 33 }, { x: 14, y: 38 }]
    .map((p, i) => ({ x: p.x + (i ? rescueRandom(rng) * 5 - 2.5 : 0), y: p.y + (i ? rescueRandom(rng) * 4 - 2 : 0) }))
  const world: RescueWorld = { width: 112, height: 104, title: RESCUE_BIOMES[biome].name,
    obstacles: [], cages: anchors.map((p, i) => ({ ...p, id: i + 1, hp: 35, open: false, rescued: false, pet: (i + biome) % 5 })),
    gifts: anchors.slice(0, 3).map((p, i) => ({ x: p.x - 5, y: p.y - 3.5, id: i + 10, kind: (['power', 'beam', 'metal'] as const)[i]!, opened: false })),
    portal: { x: 0, y: -34 }, fog: Array<number>(FOG_COLUMNS * FOG_ROWS).fill(0) }
  const routes: Array<[Vec, Vec]> = [[spawn, anchors[0]!], [spawn, world.portal], ...anchors.map(p => [spawn, p] as [Vec, Vec]),
    ...anchors.slice(1).map((p, i) => [anchors[i]!, p] as [Vec, Vec])]
  for (let i = 0; i < 160 && world.obstacles.length < 28; i++) {
    const o: RescueObstacle = { id: 30 + i, x: (rescueRandom(rng) - .5) * 100, y: (rescueRandom(rng) - .5) * 93, radius: 1.8 + rescueRandom(rng) * 3.5, style: Math.floor(rescueRandom(rng) * 4) }
    if (routes.some(([a, b]) => pointSegmentDistance(o, a, b) < HULL_RADIUS + o.radius + 2.4)) continue
    if (world.gifts.some(p => Math.hypot(p.x - o.x, p.y - o.y) < HULL_RADIUS + o.radius + 1)) continue
    if (world.obstacles.some(p => Math.hypot(p.x - o.x, p.y - o.y) < p.radius + o.radius + 1)) continue
    world.obstacles.push(o)
  }
  if (!rescueMapReachable(world)) world.obstacles = [] // Bounded safe authored fallback; never an unwinnable random seed.
  return world
}

export function revealRescueFog(world: RescueWorld, position: Vec, radius: number) {
  for (let y = 0; y < FOG_ROWS; y++) for (let x = 0; x < FOG_COLUMNS; x++) {
    const px = (x + .5) / FOG_COLUMNS * world.width - world.width / 2, py = (y + .5) / FOG_ROWS * world.height - world.height / 2
    if (Math.hypot(px - position.x, py - position.y) < radius) world.fog[y * FOG_COLUMNS + x] = 1
  }
}
