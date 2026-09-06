import { CREW_HALF_WIDTH, CREW_HEIGHT, RESCUE_BUTTON, clampRescue, type RescueCrew, type RescueInput, type StationId } from './types'

export interface InteriorPlatform { id: string; x1: number; x2: number; y: number }
export interface InteriorLadder { id: string; x: number; y1: number; y2: number }
export const RESCUE_PLATFORMS: readonly InteriorPlatform[] = [
  { id: 'keel', x1: -2.65, x2: 2.65, y: -3.4 },
  { id: 'main', x1: -4.1, x2: 4.1, y: -1.3 },
  { id: 'upper-left', x1: -3.5, x2: -.48, y: .8 },
  { id: 'upper-right', x1: .48, x2: 3.5, y: .8 },
  { id: 'crown', x1: -1.95, x2: 1.95, y: 2.8 },
]
export const RESCUE_LADDERS: readonly InteriorLadder[] = [
  { id: 'port', x: -2.15, y1: -3.4, y2: .8 },
  { id: 'starboard', x: 2.15, y1: -1.3, y2: .8 },
  { id: 'crown', x: 1.15, y1: .8, y2: 2.8 },
]
export interface StationSpec { id: StationId; name: string; short: string; x: number; y: number; angle: number; rail: boolean; color: string; description: string }
export const RESCUE_STATIONS: readonly StationSpec[] = [
  { id: 'engine', name: 'Engine', short: 'ENG', x: .6, y: -3.4, angle: -Math.PI / 2, rail: true, color: '#77f2d2', description: 'Aim the exhaust. Hold thrust to travel the opposite way.' },
  { id: 'shield', name: 'Shield', short: 'SHD', x: -1.5, y: .8, angle: Math.PI / 2, rail: true, color: '#ffe385', description: 'Aim the golden arc toward incoming fire.' },
  { id: 'north', name: 'Top turret', short: 'TOP', x: -.9, y: 2.8, angle: Math.PI / 2, rail: false, color: '#ff8bbb', description: 'Aim and fire in the upper quadrant.' },
  { id: 'east', name: 'Right turret', short: 'RGT', x: 3.45, y: -1.3, angle: 0, rail: false, color: '#ff8bbb', description: 'Aim and fire to starboard.' },
  { id: 'south', name: 'Bottom turret', short: 'BTM', x: -1.15, y: -3.4, angle: -Math.PI / 2, rail: false, color: '#ff8bbb', description: 'Aim and fire below the ship.' },
  { id: 'west', name: 'Left turret', short: 'LFT', x: -3.45, y: -1.3, angle: Math.PI, rail: false, color: '#ff8bbb', description: 'Aim and fire to port.' },
  { id: 'starburst', name: 'Starburst', short: 'NOVA', x: .4, y: 2.8, angle: Math.PI / 2, rail: true, color: '#a4a0ff', description: 'Hold to charge. Release a devastating blast.' },
  { id: 'map', name: 'Star map', short: 'MAP', x: 2.6, y: .8, angle: 0, rail: false, color: '#8ddafa', description: 'See explored space, rescue signals and the portal.' },
  { id: 'galley', name: 'Galley', short: 'COOK', x: .5, y: -1.3, angle: 0, rail: false, color: '#ffc778', description: 'Hold cook for 3 seconds. Everyone gets 75 seconds of faster actions; then leave the kitchen!' },
]
export const stationSpec = (id: StationId) => RESCUE_STATIONS.find(s => s.id === id)!
export const isRescueStation = (id: unknown): id is StationId => RESCUE_STATIONS.some(s => s.id === id)
export function nearRescueStation(p: Pick<RescueCrew, 'x' | 'y'>) {
  return RESCUE_STATIONS.filter(s => Math.abs(s.y - p.y) < .42 && Math.abs(s.x - p.x) < .7)
    .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0] ?? null
}
export function supportingPlatform(x: number, y: number, tolerance = .12): InteriorPlatform | null {
  return RESCUE_PLATFORMS.find(p => Math.abs(p.y - y) < tolerance && x > p.x1 - CREW_HALF_WIDTH && x < p.x2 + CREW_HALF_WIDTH) ?? null
}
const approach = (value: number, target: number, delta: number) => value < target ? Math.min(target, value + delta) : Math.max(target, value - delta)

/** Entirely ship-local. A macro position/velocity cannot be passed into this controller. */
export function advanceRescueCrew(p: RescueCrew, input: RescueInput, dt: number, speed = 1) {
  const pressed = input.buttons & ~p.lastButtons
  p.coyote = p.grounded ? .10 : Math.max(0, p.coyote - dt)
  p.jumpBuffer = pressed & RESCUE_BUTTON.jump ? .12 : Math.max(0, p.jumpBuffer - dt)
  p.dropTime = Math.max(0, p.dropTime - dt)
  if (p.seat) { p.vx = 0; p.vy = 0; p.ladder = null; return }
  if (Math.abs(input.x) > .15) p.facing = input.x < 0 ? -1 : 1
  const ladder = RESCUE_LADDERS.find(l => Math.abs(p.x - l.x) < .36 && p.y >= l.y1 - .12 && p.y <= l.y2 + .1)
  if (!p.ladder && ladder && Math.abs(input.y) > .35 && !p.jumpBuffer) {
    const canClimb = input.y > 0 ? p.y < ladder.y2 - .05 : p.y > ladder.y1 + .05
    if (canClimb) { p.ladder = ladder.id; p.x = ladder.x; p.grounded = false }
  }
  if (p.ladder) {
    const l = RESCUE_LADDERS.find(v => v.id === p.ladder)!
    if (p.jumpBuffer > 0) { p.ladder = null; p.vy = 8.6; p.jumpBuffer = 0; p.coyote = 0; p.vx = input.x * 5.3 }
    else if (Math.abs(input.x) > .4 && supportingPlatform(p.x, p.y, .18)) { p.y = supportingPlatform(p.x, p.y, .18)!.y; p.ladder = null; p.grounded = true; p.vy = 0 }
    else {
      p.x = l.x; p.vx = 0; p.vy = 0; p.y = clampRescue(p.y + input.y * 3.5 * speed * dt, l.y1, l.y2)
      p.step += Math.abs(input.y) * dt * 5
      if ((p.y === l.y1 && input.y < 0) || (p.y === l.y2 && input.y > 0)) { p.ladder = null; p.grounded = true }
      return
    }
  }
  if (p.jumpBuffer > 0 && p.coyote > 0) {
    if (input.y < -.5 && p.y > -3) { p.dropTime = .24; p.y -= .08; p.vy = -1 }
    else p.vy = 9.2
    p.grounded = false; p.coyote = 0; p.jumpBuffer = 0
  }
  if (!(input.buttons & RESCUE_BUTTON.jump) && p.vy > 4.5) p.vy = Math.max(4.5, p.vy - 35 * dt)
  p.vx = approach(p.vx, input.x * 5.3 * speed, (p.grounded ? 65 : 36) * speed * dt)
  p.vy = Math.max(-18, p.vy - 24 * dt)
  const oldY = p.y
  p.x += p.vx * dt; p.y += p.vy * dt; p.grounded = false
  const centerY = p.y + CREW_HEIGHT / 2
  const limitX = Math.sqrt(Math.max(.2, 4.43 ** 2 - centerY ** 2)) - CREW_HALF_WIDTH
  if (Math.abs(p.x) > limitX) { p.x = clampRescue(p.x, -limitX, limitX); p.vx = 0 }
  if (p.y + CREW_HEIGHT > 4.2) { p.y = 4.2 - CREW_HEIGHT; p.vy = Math.min(0, p.vy) }
  if (p.vy <= 0 && p.dropTime <= 0) {
    for (const platform of [...RESCUE_PLATFORMS].reverse()) {
      if (oldY >= platform.y - .025 && p.y <= platform.y && p.x > platform.x1 - CREW_HALF_WIDTH && p.x < platform.x2 + CREW_HALF_WIDTH) {
        p.y = platform.y; p.vy = 0; p.grounded = true; break
      }
    }
  }
  // The sealed curved keel is a floor, not a death plane or teleport recovery.
  if (p.y < -3.4) { p.y = -3.4; p.x = clampRescue(p.x, -2.65, 2.65); p.vy = 0; p.grounded = true }
  p.step += Math.abs(p.vx) * dt
}

export function createRescueCrew(id: string, name: string, second: boolean, pet = false): RescueCrew {
  return { id, name: name.slice(0, 16), color: second ? 'coral' : 'mint', pet, origin: pet ? 'companion' : 'human', ability: pet ? 'scout' : 'none', abilityCooldown: 0, tourEnds: pet ? 2 : 0, x: second ? 1 : -1, y: -1.3, vx: 0, vy: 0,
    grounded: true, ladder: null, facing: second ? -1 : 1, seat: null, gem: null, coyote: 0, jumpBuffer: 0, dropTime: 0,
    lastButtons: 0, lastSeq: -1, commandSeq: -1, step: 0, order: 'east', route: [], routeAt: 0, routeAge: 0, routeLastX: 0, routeLastY: 0 }
}
