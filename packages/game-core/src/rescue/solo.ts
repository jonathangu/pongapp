import { MAX_RESCUE_CREW, RESCUE_BUTTON, rescueEvent, type RescueInput, type RescueState } from './types'
import { createRescueCrew, stationSpec } from './interior'
import { damageRescueCage, damageRescueEnemy } from './combat'

export const TOGETHER_RADIUS = 18
export const TOGETHER_COOLDOWN = 8
export const isSoloCrossing = (s: RescueState) => Boolean(s.captainMode && s.solo && s.story && s.seamanship)

/** Offline captain mode is explicitly selected by the session, never by room presence. */
export function prepareSoloCrossing(s: RescueState) {
  if (!isSoloCrossing(s)) return
  // Keep the phone view focused on this family's boat; harbors retain trading/repairs.
  s.vessels = s.vessels.filter(v => v.role === 'raider')
  const captain = s.crew.find(c => !c.pet), finn = s.crew.find(c => c.id === s.story!.sonId && c.pet)
  let cook = s.crew.find(c => c.pet && c.id !== finn?.id && c.origin === 'companion')
    ?? s.crew.find(c => c.pet && c.id !== finn?.id)
  if (!cook && s.crew.length < MAX_RESCUE_CREW) {
    cook = createRescueCrew(`solo-cook-${s.nextId++}`, 'Pip', true, true)
    s.crew.push(cook)
  }
  if (cook) cook.tourEnds = 1e9
  const jobs = [[captain, 'engine'], [finn, 'east'], [cook, 'galley']] as const
  // Placement only at launch/resume/chapter boundaries; crew never teleport mid-sailing.
  for (const [person, job] of jobs) {
    if (!person) continue
    for (const other of s.crew) if (other.id !== person.id && other.seat === job) other.seat = null
    const spec = stationSpec(job)
    Object.assign(person, { seat: job, order: job, commandSeq: 0, x: spec.x, y: spec.y, vx: 0, vy: 0, grounded: true, ladder: null, route: [], routeAt: 0 })
  }
}

/** A deliberate tap, not hold-to-win: short protection, a local clear and cage rescue. */
export function callTogether(s: RescueState, inputs: Record<string, RescueInput>) {
  if (!isSoloCrossing(s)) return false
  const captain = s.crew.find(c => !c.pet), station = s.stations.find(st => st.id === 'starburst')!
  const input = captain && inputs[captain.id]
  if (!captain || !input?.active || !input.assist || captain.seat !== 'engine' || station.cooldown > 0 || !(input.buttons & RESCUE_BUTTON.fire) || captain.lastButtons & RESCUE_BUTTON.fire) return false
  station.cooldown = TOGETHER_COOLDOWN
  s.ship.invulnerable = Math.max(s.ship.invulnerable, 1.25)
  const near = (p: { x: number; y: number }) => Math.hypot(p.x - s.ship.x, p.y - s.ship.y) <= TOGETHER_RADIUS
  const before = s.bullets.length
  s.bullets = s.bullets.filter(b => !b.enemy || !near(b)); s.stats.blocks += before - s.bullets.length
  for (const cage of s.world.cages) if (!cage.open && near(cage)) damageRescueCage(s, cage.id, 35)
  for (const enemy of s.enemies) if (near(enemy)) damageRescueEnemy(s, enemy, 55, s.ship.x, s.ship.y, true)
  rescueEvent(s, 'together', s.ship.x, s.ship.y, 0, TOGETHER_RADIUS, 1, 'Mara & Finn')
  return true
}
