import { HULL_RADIUS, RESCUE_BUTTON, neutralRescueInput, type RescueCrew, type RescueInput, type RescueState, type StationId } from './types'
import { RESCUE_LADDERS, RESCUE_PLATFORMS, RESCUE_STATIONS, advanceRescueCrew, createRescueCrew, stationSpec, supportingPlatform } from './interior'

export interface RescueNavNode { id: number; x: number; y: number; platform: string }
export interface RescueNavEdge { to: number; kind: 'walk' | 'climb' | 'jump' | 'drop'; cost: number }
export interface RescueNavGraph { nodes: RescueNavNode[]; edges: RescueNavEdge[][] }

/** Validate jump edges with the actual player controller, not a second ballistic approximation. */
function jumpPossible(a: RescueNavNode, b: RescueNavNode) {
  const p = createRescueCrew('route-probe', 'probe', false); p.x = a.x; p.y = a.y
  let airborne = false
  for (let tick = 0; tick < 110; tick++) {
    const input = neutralRescueInput(tick)
    input.x = Math.abs(b.x - p.x) < .12 ? 0 : Math.sign(b.x - p.x)
    input.buttons = tick < 16 ? RESCUE_BUTTON.jump : 0
    advanceRescueCrew(p, input, 1 / 60); p.lastButtons = input.buttons
    airborne ||= !p.grounded
    if (airborne && p.grounded) return Math.abs(p.y - b.y) < .05 && Math.abs(p.x - b.x) < .4
  }
  return false
}

export function buildRescueNavigation(): RescueNavGraph {
  const nodes: RescueNavNode[] = []
  for (const platform of RESCUE_PLATFORMS) {
    const xs = [platform.x1 + .3, platform.x2 - .3,
      ...RESCUE_LADDERS.filter(l => l.x > platform.x1 && l.x < platform.x2 && platform.y >= l.y1 && platform.y <= l.y2).map(l => l.x),
      ...RESCUE_STATIONS.filter(s => s.y === platform.y).map(s => s.x)]
    for (const x of [...new Set(xs)].sort((a, b) => a - b)) nodes.push({ id: nodes.length, x, y: platform.y, platform: platform.id })
  }
  const edges: RescueNavEdge[][] = nodes.map(() => [])
  for (const a of nodes) for (const b of nodes) {
    if (a.id === b.id) continue
    if (a.platform === b.platform) edges[a.id]!.push({ to: b.id, kind: 'walk', cost: Math.abs(a.x - b.x) / 5.3 })
    else if (Math.abs(a.x - b.x) < .01 && RESCUE_LADDERS.some(l => Math.abs(l.x - a.x) < .01 && Math.min(a.y, b.y) >= l.y1 && Math.max(a.y, b.y) <= l.y2)) {
      edges[a.id]!.push({ to: b.id, kind: 'climb', cost: Math.abs(a.y - b.y) / 3.5 + .12 })
    } else if (a.y === b.y && Math.abs(a.x - b.x) < 2.5 && jumpPossible(a, b)) {
      edges[a.id]!.push({ to: b.id, kind: 'jump', cost: .8 + Math.abs(a.x - b.x) / 5.3 })
    } else if (a.y > b.y && Math.abs(a.x - b.x) < .01) {
      const first = RESCUE_PLATFORMS.filter(p => p.y < a.y && a.x > p.x1 && a.x < p.x2).sort((p, q) => q.y - p.y)[0]
      if (first?.id === b.platform) edges[a.id]!.push({ to: b.id, kind: 'drop', cost: Math.sqrt((a.y - b.y) / 12) + .2 })
    }
  }
  return { nodes, edges }
}
export const RESCUE_NAV = buildRescueNavigation()

export function rescuePath(from: { x: number; y: number }, station: StationId, graph = RESCUE_NAV): number[] {
  const platform = supportingPlatform(from.x, from.y, .3)
  const candidates = platform ? graph.nodes.filter(n => n.platform === platform.id) : graph.nodes
  const start = [...candidates].sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0]!
  const target = stationSpec(station)
  const goal = graph.nodes.find(n => n.x === target.x && n.y === target.y)!
  const open = new Set([start.id]), came = new Map<number, number>(), cost = new Map([[start.id, 0]])
  const heuristic = (id: number) => { const n = graph.nodes[id]!; return Math.hypot(n.x - goal.x, n.y - goal.y) / 5.3 }
  while (open.size) {
    const current = [...open].sort((a, b) => (cost.get(a)! + heuristic(a)) - (cost.get(b)! + heuristic(b)) || a - b)[0]!
    if (current === goal.id) { const path = [current]; while (came.has(path[0]!)) path.unshift(came.get(path[0]!)!); return path }
    open.delete(current)
    for (const edge of graph.edges[current]!) {
      const nextCost = cost.get(current)! + edge.cost
      if (nextCost < (cost.get(edge.to) ?? Infinity)) { cost.set(edge.to, nextCost); came.set(edge.to, current); open.add(edge.to) }
    }
  }
  return []
}

export function routeRescueCrew(p: RescueCrew, destination: StationId, tick: number, dt: number): RescueInput {
  const input = neutralRescueInput(tick)
  if (p.seat === destination) return input
  if (p.seat) { input.buttons = p.lastButtons & RESCUE_BUTTON.jump ? 0 : RESCUE_BUTTON.jump; return input }
  const target = stationSpec(destination)
  if (Math.abs(p.y - target.y) < .1 && Math.abs(p.x - target.x) < .35 && p.grounded) {
    input.buttons = p.lastButtons & RESCUE_BUTTON.interact ? 0 : RESCUE_BUTTON.interact
    return input
  }
  const moved = Math.hypot(p.x - p.routeLastX, p.y - p.routeLastY)
  p.routeAge = moved > .02 ? 0 : p.routeAge + dt; p.routeLastX = p.x; p.routeLastY = p.y
  if ((!p.route.length || p.routeAt >= p.route.length || p.routeAge > 1.8) && (p.grounded || p.ladder)) {
    p.route = rescuePath(p, destination); p.routeAt = 0; p.routeAge = 0
  }
  let next = RESCUE_NAV.nodes[p.route[p.routeAt] ?? -1]
  if (!next) { input.x = Math.sign(target.x - p.x); return input }
  if (Math.abs(next.x - p.x) < .18 && Math.abs(next.y - p.y) < .15 && (p.grounded || p.ladder)) {
    p.routeAt++; next = RESCUE_NAV.nodes[p.route[p.routeAt] ?? -1]
    if (!next) return input
  }
  const previous = RESCUE_NAV.nodes[p.route[p.routeAt - 1] ?? -1]
  const edge = previous ? RESCUE_NAV.edges[previous.id]!.find(e => e.to === next!.id) : null
  input.x = Math.abs(next.x - p.x) < .11 ? 0 : Math.sign(next.x - p.x)
  if (edge?.kind === 'climb' && Math.abs(next.x - p.x) < .25) { input.x = 0; input.y = Math.sign(next.y - p.y) }
  else if (edge?.kind === 'jump') { if (p.grounded && Math.abs(next.x - p.x) > .4) input.buttons |= RESCUE_BUTTON.jump; else if (p.vy > 0) input.buttons |= RESCUE_BUTTON.jump }
  else if (edge?.kind === 'drop' && p.y > next.y + .2) { input.y = -1; if (p.grounded) input.buttons |= RESCUE_BUTTON.jump }
  return input
}

export function petRescueInput(s: RescueState, p: RescueCrew, dt: number): RescueInput {
  // Until explicitly commanded, pick a useful gun. Explicit orders never get overridden.
  if (p.commandSeq < 0 && s.tick % 120 === 0) {
    const target = [...s.enemies].sort((a, b) => Math.hypot(a.x - s.ship.x, a.y - s.ship.y) - Math.hypot(b.x - s.ship.x, b.y - s.ship.y))[0]
      ?? [...s.world.cages].filter(c => !c.open).sort((a, b) => Math.hypot(a.x - s.ship.x, a.y - s.ship.y) - Math.hypot(b.x - s.ship.x, b.y - s.ship.y))[0]
    if (target) {
      const angle = Math.atan2(target.y - s.ship.y, target.x - s.ship.x)
      const order: StationId = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle)) ? Math.cos(angle) > 0 ? 'east' : 'west' : Math.sin(angle) > 0 ? 'north' : 'south'
      const candidates: StationId[] = [order, 'east', 'west', 'north', 'south', 'shield', s.meal.remaining < 10 ? 'galley' : 'map']
      const available = candidates.find(id => !s.crew.some(c => c.id !== p.id && (c.seat === id || c.pet && c.order === id)))
      if (available && available !== p.order) { p.order = available; p.route = [] }
    }
  }
  if (p.seat !== p.order) return routeRescueCrew(p, p.order, s.tick, dt)
  const input = neutralRescueInput(s.tick)
  if (p.seat === 'shield') {
    const bullet = [...s.bullets].filter(b => b.enemy).map(b => {
      const x = b.x - s.ship.x, y = b.y - s.ship.y, vx = b.vx - s.ship.vx, vy = b.vy - s.ship.vy
      return { b, time: -(x * vx + y * vy) / Math.max(.01, vx * vx + vy * vy) }
    }).filter(b => b.time > 0).sort((a, b) => a.time - b.time)[0]?.b
    const target = bullet ?? s.enemies[0]
    if (target) { input.aimX = target.x - s.ship.x; input.aimY = target.y - s.ship.y }
    return input
  }
  if (p.seat === 'engine') {
    // Safe hold: deliberate human steering remains preferable; a pet never chooses a blind destination.
    if (Math.hypot(s.ship.vx, s.ship.vy) > .3) { input.aimX = s.ship.vx; input.aimY = s.ship.vy; input.buttons = RESCUE_BUTTON.fire }
    return input
  }
  if (p.seat === 'map') return input
  if (p.seat === 'galley') { if (s.meal.cooldown <= 0) input.buttons = RESCUE_BUTTON.fire; return input }
  const spec = stationSpec(p.seat)
  const station = s.stations.find(v => v.id === p.seat)!
  const muzzleAngle = spec.rail ? station.angle : spec.angle
  const muzzleX = s.ship.x + Math.cos(muzzleAngle) * (HULL_RADIUS + .6), muzzleY = s.ship.y + Math.sin(muzzleAngle) * (HULL_RADIUS + .6)
  const aim = (target: { x: number; y: number }) => {
    const distance = Math.hypot(target.x - muzzleX, target.y - muzzleY)
    const flight = !station.upgrade || station.upgrade === 'power' ? distance / 24 : 0
    return { x: target.x - muzzleX - s.ship.vx * flight, y: target.y - muzzleY - s.ship.vy * flight }
  }
  const candidates = [...s.enemies, ...s.world.cages.filter(c => !c.open)]
    .filter(t => { const a = aim(t); return spec.rail || Math.abs(Math.atan2(Math.sin(Math.atan2(a.y, a.x) - spec.angle), Math.cos(Math.atan2(a.y, a.x) - spec.angle))) < Math.PI / 3 })
    .filter(t => Math.hypot(t.x - s.ship.x, t.y - s.ship.y) < 30)
    .sort((a, b) => Math.hypot(a.x - s.ship.x, a.y - s.ship.y) - Math.hypot(b.x - s.ship.x, b.y - s.ship.y))
  const target = candidates[0]
  if (target) {
    const a = aim(target); input.aimX = a.x; input.aimY = a.y
    input.buttons = p.seat === 'starburst' && station.charge >= 1 ? 0 : RESCUE_BUTTON.fire
  }
  return input
}
