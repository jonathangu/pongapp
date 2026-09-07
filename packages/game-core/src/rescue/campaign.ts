import { MAX_RESCUE_CREW, RESCUE_CREW_COLORS, rescueEvent, rescueRandom, type CrewAbility, type RescueCrew, type RescueDock, type RescueRegion, type RescueState, type ShipUpgrade } from './types'
import { createRescueCrew } from './interior'
import { damageRescueShip, shieldCovers } from './combat'
import { pointSegmentDistance, revealRescueFog } from './world'

export const RESCUE_ABILITIES: Record<CrewAbility, { name: string; description: string }> = {
  none: { name: 'Captain', description: 'Your hands, your adventure.' },
  pilot: { name: 'Tailwind', description: '25% stronger thrust while operating the engine.' },
  medic: { name: 'Heartmender', description: 'Repairs one heart every 35 seconds while aboard.' },
  prism: { name: 'Prism veil', description: 'Briefly leaves a shield after operating its station.' },
  spark: { name: 'Quick spark', description: '20% faster station actions.' },
  scout: { name: 'Starlight nose', description: 'Reveals a wider circle of the map every 8 seconds.' },
}
const RECRUITS = [
  { name: 'Tavi', ability: 'pilot' }, { name: 'Mochi', ability: 'medic' }, { name: 'Luma', ability: 'prism' },
  { name: 'Zip', ability: 'spark' }, { name: 'Fern', ability: 'scout' },
] as const
export function makeRescueDocks(region: RescueRegion): RescueDock[] {
  if (region === 'space') return [
    { id: 'orbital', name: 'Lantern Orbital', kind: 'city', x: -15, y: -22, destination: null },
    { id: 'reentry', name: 'Bluewater Descent', kind: 'launch', x: 24, y: -22, destination: 'sea' },
  ]
  if (region === 'jungle') return [
    { id: 'canopy', name: 'Canopy Village', kind: 'town', x: -15, y: -22, destination: null },
    { id: 'river-mouth', name: 'River to the Sea', kind: 'island', x: 24, y: -22, destination: 'sea' },
  ]
  return [
    { id: 'harbor', name: 'Little Lantern Town', kind: 'town', x: -15, y: -22, destination: null },
    { id: 'city', name: 'Coralbell City', kind: 'city', x: -34, y: 22, destination: null },
    { id: 'island', name: 'Fernheart Island', kind: 'island', x: 24, y: -22, destination: 'jungle' },
    { id: 'launch', name: 'Skyhook Launch Station', kind: 'launch', x: 37, y: 33, destination: 'space' },
  ]
}
export function clearRescueDockApproaches(s: RescueState) {
  s.world.obstacles = s.world.obstacles.filter(o => s.docks.every(d => pointSegmentDistance(o, { x: 0, y: -24 }, d) > o.radius + 7))
}
export function nearestRescueDock(s: RescueState) {
  return [...s.docks].filter(d => Math.hypot(d.x - s.ship.x, d.y - s.ship.y) < 9).sort((a, b) => Math.hypot(a.x - s.ship.x, a.y - s.ship.y) - Math.hypot(b.x - s.ship.x, b.y - s.ship.y))[0] ?? null
}
export function dockRescueShip(s: RescueState): boolean {
  if (s.docked || s.phase === 'lost') return false
  const dock = nearestRescueDock(s)
  if (!dock || Math.hypot(s.ship.vx, s.ship.vy) > 4) return false
  s.docked = dock.id; s.ship.vx = 0; s.ship.vy = 0; s.ship.hp = s.ship.maxHp
  s.bullets = []; s.campaign.portVisits++
  for (const p of [...s.crew]) if (p.pet && p.origin !== 'human' && p.id !== s.story?.motherId && p.id !== s.story?.sonId && p.tourEnds <= s.campaign.voyages) {
    if (p.gem !== null) { const gem = s.gems.find(g => g.id === p.gem); if (gem) { gem.heldBy = null; gem.x = p.x; gem.y = p.y + .3 } }
    const memory = s.campaign.alumni.find(a => a.id === p.id)
    if (memory) memory.availableAt = s.campaign.portVisits + 2
    else if (s.campaign.alumni.length < 64) s.campaign.alumni.push({ id: p.id, name: p.name, color: p.color, ability: p.ability, availableAt: s.campaign.portVisits + 2, reunions: 0 })
    s.crew = s.crew.filter(c => c.id !== p.id); rescueEvent(s, 'depart', s.ship.x, s.ship.y, 0, 1, 0, p.name)
  }
  rescueEvent(s, 'dock', dock.x, dock.y, 0, 1, 0, dock.name)
  return true
}
export function availableRescueCrew(s: RescueState) {
  const alumni = s.campaign.alumni.filter(a => a.availableAt <= s.campaign.portVisits && !s.crew.some(c => c.id === a.id)).slice(0, 3)
  return [...alumni.map(a => ({ id: a.id, name: a.name, ability: a.ability, reunion: true })),
    ...RECRUITS.map((r, i) => ({ id: `port-${s.campaign.voyages}-${i}`, ...r, reunion: false })).filter(r => !s.crew.some(c => c.id === r.id))].slice(0, 5)
}
function usefulOrder(s: RescueState, p: RescueCrew) {
  const preferred = p.ability === 'pilot' ? 'engine' : p.ability === 'prism' ? 'shield' : p.ability === 'scout' ? 'map' : 'east'
  p.order = ([preferred, 'east', 'west', 'north', 'south', 'shield', 'map', 'galley'] as const).find(id => !s.crew.some(c => c.id !== p.id && (c.seat === id || c.pet && c.order === id))) ?? 'galley'
}
export function recruitRescueCrew(s: RescueState, choice: string, rescuedPet?: number): boolean {
  if (s.crew.length >= MAX_RESCUE_CREW || (rescuedPet === undefined && !s.docked)) return false
  const offer = rescuedPet === undefined ? availableRescueCrew(s).find(c => c.id === choice) : { id: `rescued-${s.campaign.voyages}-${choice}`, ...RECRUITS[rescuedPet % RECRUITS.length]!, reunion: false }
  if (!offer || s.crew.some(c => c.id === offer.id)) return false
  const memory = s.campaign.alumni.find(a => a.id === offer.id)
  const p = createRescueCrew(offer.id, offer.name, true, true)
  p.origin = 'recruit'; p.ability = offer.ability; p.tourEnds = s.campaign.voyages + 2
  p.color = memory?.color ?? RESCUE_CREW_COLORS[(rescuedPet ?? s.crew.length) % RESCUE_CREW_COLORS.length]!
  p.x = (s.crew.length % 5 - 2) * .4; usefulOrder(s, p); s.crew.push(p)
  if (memory) memory.reunions++
  rescueEvent(s, offer.reunion ? 'reunion' : 'recruit', s.ship.x, s.ship.y, 0, 1, 0, p.name)
  return true
}
export const rescueUpgradeCost = (s: RescueState, kind: ShipUpgrade) => 15 + s.campaign.upgrades[kind] * 15
export function buyRescueUpgrade(s: RescueState, kind: ShipUpgrade): boolean {
  if (!s.docked || !['hull', 'drive', 'reactor', 'tractor'].includes(kind) || s.campaign.upgrades[kind] >= 3) return false
  const cost = rescueUpgradeCost(s, kind)
  if (s.campaign.salvage < cost) return false
  s.campaign.salvage -= cost; s.campaign.upgrades[kind]++
  if (kind === 'hull') { s.ship.maxHp = 12 + s.campaign.upgrades.hull * 3; s.ship.hp = s.ship.maxHp }
  rescueEvent(s, 'upgrade', s.ship.x, s.ship.y, 0, 1, s.campaign.upgrades[kind], kind)
  return true
}
export function advanceRescueAbilities(s: RescueState, dt: number) {
  s.meal.remaining = Math.max(0, s.meal.remaining - dt); s.meal.cooldown = Math.max(0, s.meal.cooldown - dt)
  for (const p of s.crew) {
    p.abilityCooldown = Math.max(0, p.abilityCooldown - dt)
    if (!p.pet || p.abilityCooldown > 0) continue
    if (p.ability === 'medic' && s.ship.hp < s.ship.maxHp) {
      s.ship.hp = Math.min(s.ship.maxHp, s.ship.hp + 1); p.abilityCooldown = 35; rescueEvent(s, 'ability', s.ship.x + p.x, s.ship.y + p.y, 0, 1, 1, p.name)
    } else if (p.ability === 'scout') { revealRescueFog(s.world, s.ship, 29); p.abilityCooldown = 8 }
  }
}
export function advanceRescueWeather(s: RescueState, dt: number) {
  const w = s.weather, cycle = (s.time + s.biome * 20) % 180
  w.phase = cycle < 40 ? 'clear' : cycle < 60 ? 'building' : cycle < 140 ? 'storm' : 'eye'
  const target = w.phase === 'storm' ? 1 : w.phase === 'building' ? (cycle - 40) / 20 : 0
  w.intensity += (target - w.intensity) * Math.min(1, dt * .4); w.wave += dt * (1 + w.intensity * 1.8); w.flash = Math.max(0, w.flash - dt * 3)
  const strength = w.intensity * (s.region === 'space' ? .5 : 1)
  // Waves translate the macro hull only. Crew gravity and hull rotation are invariant.
  s.ship.vx += Math.sin(w.wave * .7 + s.ship.y * .08) * strength * 5 * dt
  s.ship.vy += Math.sin(w.wave * 1.2 + s.ship.x * .15) * strength * 7 * dt
  if (!w.strike && w.intensity > .6 && s.time >= w.nextStrike) {
    w.strike = { x: s.ship.x + s.ship.vx * .8 + (rescueRandom(s) - .5) * 7, y: s.ship.y + s.ship.vy * .8, at: s.time + 2.2 }
    w.nextStrike = s.time + 9 + rescueRandom(s) * 5
  }
  if (w.strike && s.time >= w.strike.at) {
    const strike = w.strike; w.strike = null; w.flash = 1
    rescueEvent(s, 'lightning', strike.x, strike.y, Math.PI / 2, 3)
    rescueEvent(s, 'thunder', strike.x, strike.y)
    if (Math.hypot(strike.x - s.ship.x, strike.y - s.ship.y) < 7) {
      if (shieldCovers(s, Math.PI / 2)) { s.stats.blocks++; rescueEvent(s, 'shield', s.ship.x, s.ship.y + 5) }
      else damageRescueShip(s, 2, strike.x, strike.y + 10)
    }
  }
}
