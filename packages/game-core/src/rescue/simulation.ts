import { HULL_RADIUS, RESCUE_BUTTON, RESCUE_STEP, clampRescue, neutralRescueInput, rescueAngle, rescueEvent, rescueRandom,
  type RescueCrew, type RescueInput, type RescueState, type StationId } from './types'
import { RESCUE_PLATFORMS, advanceRescueCrew, nearRescueStation, stationSpec } from './interior'
import { petRescueInput, routeRescueCrew } from './navigation'
import { advanceRescueBullets, advanceRescueEnemies, damageRescueEnemy, damageRescueShip, damageRescueVessel, openRescueGift, rescueBeam, spawnRescueBullet, spawnRescueEnemy } from './combat'
import { revealRescueFog, segmentCircle } from './world'
import { advanceRescueAbilities, advanceRescueWeather, recruitRescueCrew } from './campaign'
import { advanceRescueStory } from './story'

export function validRescueInput(value: unknown): value is RescueInput {
  if (!value || typeof value !== 'object') return false
  const v = value as RescueInput
  return Number.isSafeInteger(v.seq) && v.seq >= 0 && v.seq < Number.MAX_SAFE_INTEGER &&
    [v.x, v.y, v.aimX, v.aimY].every(n => typeof n === 'number' && Number.isFinite(n) && n >= -1 && n <= 1) &&
    Number.isInteger(v.buttons) && v.buttons >= 0 && v.buttons <= 31 && typeof v.active === 'boolean' &&
    (v.command === null || ['engine', 'shield', 'north', 'east', 'south', 'west', 'starburst', 'map', 'galley'].includes(v.command)) &&
    (v.commandCrew === null || typeof v.commandCrew === 'string' && v.commandCrew.length <= 80) &&
    (v.assist === undefined || typeof v.assist === 'boolean')
}

function socketGem(s: RescueState, id: number, stationId: StationId) {
  const gem = s.gems.find(g => g.id === id), station = s.stations.find(v => v.id === stationId)!
  if (!gem || gem.socket || station.upgrade) return false
  station.upgrade = gem.kind; gem.socket = stationId; gem.heldBy = null; gem.thrown = false
  for (const crew of s.crew) if (crew.gem === id) crew.gem = null
  s.stats.sockets++; rescueEvent(s, 'socket', s.ship.x, s.ship.y, 0, 1, 0, stationId, gem.kind)
  return true
}
function interactCrew(s: RescueState, p: RescueCrew, input: RescueInput) {
  const pressed = input.buttons & ~p.lastButtons
  if (p.seat) {
    if (pressed & RESCUE_BUTTON.jump) {
      const seat = stationSpec(p.seat); p.seat = null; p.x = seat.x; p.y = seat.y; p.grounded = true; p.vx = 0
      rescueEvent(s, 'seat', s.ship.x, s.ship.y, 0, .5, 0, p.id)
    }
    return
  }
  if (pressed & RESCUE_BUTTON.drop && p.gem !== null) {
    const gem = s.gems.find(g => g.id === p.gem)!
    gem.heldBy = null; gem.x = p.x + p.facing * .35; gem.y = p.y + .55; gem.vx = p.facing * 6; gem.vy = 4; gem.thrown = true; p.gem = null
  }
  if (!(pressed & RESCUE_BUTTON.interact)) return
  const seat = nearRescueStation(p)
  if (p.gem !== null) { if (seat) socketGem(s, p.gem, seat.id); return }
  const gem = [...s.gems].filter(g => !g.heldBy && !g.socket && Math.hypot(g.x - p.x, g.y - (p.y + .35)) < .9).sort((a, b) => a.id - b.id)[0]
  if (gem) { gem.heldBy = p.id; p.gem = gem.id; return }
  if (seat && p.grounded && !s.crew.some(c => c.id !== p.id && c.seat === seat.id)) {
    p.seat = seat.id; p.x = seat.x; p.y = seat.y; p.vx = 0; p.vy = 0; p.ladder = null
    rescueEvent(s, 'seat', s.ship.x, s.ship.y, 0, .5, 1, p.id)
  }
}
function advanceGems(s: RescueState, dt: number) {
  for (const gem of s.gems) {
    if (gem.socket) { const spec = stationSpec(gem.socket); gem.x = spec.x; gem.y = spec.y + .6; continue }
    if (gem.heldBy) {
      const p = s.crew.find(c => c.id === gem.heldBy)
      if (p) { gem.x = p.x + p.facing * .32; gem.y = p.y + .55; continue }
      gem.heldBy = null
    }
    const oldY = gem.y
    gem.vy = Math.max(-14, gem.vy - 18 * dt); gem.x += gem.vx * dt; gem.y += gem.vy * dt; gem.vx *= Math.exp(-2 * dt)
    const maxX = Math.sqrt(Math.max(.1, 4.2 ** 2 - gem.y ** 2)) - .1
    if (Math.abs(gem.x) > maxX) { gem.x = clampRescue(gem.x, -maxX, maxX); gem.vx *= -.35 }
    if (gem.y > 3.9) { gem.y = 3.9; gem.vy *= -.3 }
    if (gem.vy <= 0) for (const platform of [...RESCUE_PLATFORMS].reverse()) {
      if (oldY >= platform.y + .15 && gem.y <= platform.y + .15 && gem.x > platform.x1 && gem.x < platform.x2) { gem.y = platform.y + .15; gem.vy = 0; break }
    }
    if (gem.y < -3.25) { gem.y = -3.25; gem.x = clampRescue(gem.x, -2.5, 2.5); gem.vy = 0 }
    if (gem.thrown) {
      const near = s.stations.find(st => { const spec = stationSpec(st.id); return !st.upgrade && Math.hypot(spec.x - gem.x, spec.y + .65 - gem.y) < .32 })
      if (near) socketGem(s, gem.id, near.id)
      else if (Math.abs(gem.vx) < .2 && gem.vy === 0) gem.thrown = false
    }
  }
}

function operateRescueStation(s: RescueState, p: RescueCrew, input: RescueInput, dt: number) {
  if (!p.seat) return
  const speed = (s.meal.remaining > 0 ? 1.2 : 1) * (p.ability === 'spark' ? 1.2 : 1)
  const actionDt = dt * speed
  const station = s.stations.find(v => v.id === p.seat)!, spec = stationSpec(p.seat)
  station.operated = true
  const ax = Math.abs(input.aimX) + Math.abs(input.aimY) > .1 ? input.aimX : input.x
  const ay = Math.abs(input.aimX) + Math.abs(input.aimY) > .1 ? input.aimY : input.y
  if (Math.hypot(ax, ay) > .15) {
    let target = Math.atan2(ay, ax)
    if (!spec.rail && !input.assist) target = spec.angle + clampRescue(rescueAngle(target - spec.angle), -Math.PI / 3, Math.PI / 3)
    station.angle = rescueAngle(station.angle + clampRescue(rescueAngle(target - station.angle), -actionDt * (p.seat === 'shield' ? 3.8 : 5), actionDt * (p.seat === 'shield' ? 3.8 : 5)))
  }
  const fire = Boolean(input.buttons & RESCUE_BUTTON.fire)
  station.firing = fire
  if (station.upgrade === 'metal' && !['engine', 'shield', 'map', 'galley', 'starburst'].includes(p.seat)) {
    const goal = fire ? station.angle + Math.sin(s.time * 7) * .7 : -Math.PI / 2
    station.flailSpeed = clampRescue(station.flailSpeed + (rescueAngle(goal - station.flailAngle) * 38 - station.flailSpeed * 4.5) * actionDt, -12, 12)
    station.flailAngle = rescueAngle(station.flailAngle + station.flailSpeed * actionDt)
  }
  if (p.seat === 'engine') {
    if (input.assist) {
      const length = Math.max(1, Math.hypot(input.x, input.y))
      const speedLimit = 10 * (1 + s.campaign.upgrades.drive * .08)
      const response = 1 - Math.exp(-7 * dt)
      s.ship.vx += (input.x / length * speedLimit - s.ship.vx) * response
      s.ship.vy += (input.y / length * speedLimit - s.ship.vy) * response
      s.ship.thrust = Math.min(1, Math.hypot(input.x, input.y))
      station.firing = s.ship.thrust > .1
      if (station.firing) station.angle = Math.atan2(-input.y, -input.x)
      return
    }
    if (fire) {
      const thrust = (station.upgrade === 'power' ? 30 : station.upgrade === 'beam' ? 18 : 22) * speed * (1 + s.campaign.upgrades.drive * .12) * (p.ability === 'pilot' ? 1.25 : 1)
      s.ship.vx -= Math.cos(station.angle) * thrust * dt; s.ship.vy -= Math.sin(station.angle) * thrust * dt; s.ship.thrust = 1
    }
    return
  }
  if (p.seat === 'shield') { if (station.upgrade === 'metal' || p.ability === 'prism') station.lingering = 2.5; return }
  if (p.seat === 'map') return
  if (p.seat === 'galley') {
    if (fire && s.meal.cooldown <= 0) {
      s.meal.progress = Math.min(3, s.meal.progress + actionDt)
      if (s.meal.progress >= 3) { s.meal.remaining = station.upgrade === 'power' ? 100 : 75; s.meal.progress = 0; s.meal.cooldown = 65; rescueEvent(s, 'meal', s.ship.x, s.ship.y, 0, 1, s.meal.remaining, p.name) }
    }
    return
  }
  const muzzleAngle = spec.rail || input.assist ? station.angle : spec.angle, x = s.ship.x + Math.cos(muzzleAngle) * (HULL_RADIUS + .6), y = s.ship.y + Math.sin(muzzleAngle) * (HULL_RADIUS + .6)
  if (p.seat === 'starburst') {
    if (fire && station.cooldown <= 0) {
      if (!station.charge) rescueEvent(s, 'charge', x, y, station.angle, 1, 0, p.id)
      station.charge = Math.min(1, station.charge + actionDt / 2.5)
    } else if (!fire && station.charge > .15 && station.cooldown <= 0) {
      const charge = station.charge
      if (station.upgrade === 'metal') {
        for (const e of s.enemies) if (Math.hypot(e.x - s.ship.x, e.y - s.ship.y) < 24) damageRescueEnemy(s, e, 105 * charge, s.ship.x, s.ship.y, true)
        s.bullets = s.bullets.filter(b => !b.enemy || Math.hypot(b.x - s.ship.x, b.y - s.ship.y) > 26)
        rescueEvent(s, 'starburst', s.ship.x, s.ship.y, 0, 24, -1, p.id)
      } else {
        const fan = station.upgrade === 'power' ? [-.22, 0, .22] : [0]
        for (const offset of fan) rescueBeam(s, x, y, station.angle + offset, charge * (station.upgrade === 'beam' ? 260 : 175), 55, p.id, true)
      }
      station.charge = 0; station.cooldown = 14; s.stats.shots++
    } else if (!fire) station.charge = Math.max(0, station.charge - dt)
    return
  }
  if (!fire || station.cooldown > 0 || station.heat >= 1.1) return
  if (station.upgrade === 'beam') {
    rescueBeam(s, x, y, station.angle, 45, 38, p.id); station.cooldown = .85; station.heat += .16
  } else if (station.upgrade === 'metal') {
    const swing = station.flailAngle, tipX = x + Math.cos(swing) * 3.3, tipY = y + Math.sin(swing) * 3.3
    for (const e of s.enemies) if (Math.hypot(e.x - tipX, e.y - tipY) < e.radius + 1.15) damageRescueEnemy(s, e, 30, tipX, tipY)
    for (const v of s.vessels) if (v.role === 'raider' && !v.disabled && Math.hypot(v.ship.x - tipX, v.ship.y - tipY) < HULL_RADIUS + 1.15) damageRescueVessel(s, v.id, 30)
    for (const cage of s.world.cages) if (!cage.open && Math.hypot(cage.x - tipX, cage.y - tipY) < 2.3) {
      cage.hp -= 30; if (cage.hp <= 0) { cage.open = true; cage.hp = 0; rescueEvent(s, 'cage', cage.x, cage.y) }
    }
    rescueEvent(s, 'flail', x, y, swing, 3.3, 30, p.id); station.cooldown = .25
  } else {
    const power = station.upgrade === 'power'
    spawnRescueBullet(s, x, y, station.angle + (power ? Math.sin(s.time * 90) * .045 : 0), 24, power ? 14 : 12, false, p.id)
    station.cooldown = power ? .13 : .24; station.heat += power ? .07 : .035
    rescueEvent(s, 'shot', x, y, station.angle, power ? .85 : .6, 0, p.id)
  }
  s.stats.shots++
}

/** NPC crew use the same route follower, seats and engine force as the player's crew. */
export function advanceRescueVessels(s: RescueState, dt: number) {
  for (const v of s.vessels) {
    if (v.disabled) continue
    // The opening rescue teaches the ship before hostile crews enter the encounter budget.
    if (v.role === 'raider' && (s.stats.rescues < 2 || s.time < 45)) continue
    const distance = Math.hypot(v.ship.x - s.ship.x, v.ship.y - s.ship.y)
    if (distance > 55) continue
    v.cooldown = Math.max(0, v.cooldown - dt); v.ship.invulnerable = Math.max(0, v.ship.invulnerable - dt)
    const target = v.role === 'raider' ? s.ship : v.role === 'ally' && distance < 30 ? { x: s.ship.x - 12, y: s.ship.y + 9 } : { x: v.targetX + Math.sin(s.time * .04) * 6, y: v.targetY + Math.cos(s.time * .04) * 5 }
    const npc: RescueState = { ...s, ship: v.ship, crew: v.crew, stations: v.stations, events: [],
      campaign: { ...s.campaign, upgrades: { hull: 0, drive: 0, reactor: 0, tractor: 0 } }, meal: { remaining: 0, progress: 0, cooldown: 0 }, stats: { ...s.stats }, vessels: s.vessels.filter(other => other.id !== v.id),
      world: { ...s.world, cages: [], gifts: [] }, enemies: v.role === 'raider' ? [] : s.enemies }
    for (const station of v.stations) { station.operated = false; station.firing = false; station.cooldown = Math.max(0, station.cooldown - dt); station.heat = Math.max(0, station.heat - dt * .19); station.lingering = Math.max(0, station.lingering - dt) }
    for (const p of v.crew) {
      if (p.order !== 'engine' && v.role === 'raider' && s.tick % 120 === 0) {
        const angle = Math.atan2(s.ship.y - v.ship.y, s.ship.x - v.ship.x)
        p.order = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle)) ? Math.cos(angle) > 0 ? 'east' : 'west' : Math.sin(angle) > 0 ? 'north' : 'south'
      }
      let input = p.seat === p.order ? petRescueInput(npc, p, dt) : routeRescueCrew(p, p.order, s.tick, dt)
      if (p.seat === 'engine' && p.order === 'engine') {
        input = neutralRescueInput(s.tick)
        const dx = target.x - v.ship.x, dy = target.y - v.ship.y, d = Math.hypot(dx, dy), hold = v.role === 'raider' ? 17 : 2
        if (d > hold) { input.aimX = -dx; input.aimY = -dy; input.buttons = RESCUE_BUTTON.fire }
        else if (Math.hypot(v.ship.vx, v.ship.vy) > .5) { input.aimX = v.ship.vx; input.aimY = v.ship.vy; input.buttons = RESCUE_BUTTON.fire }
      } else if (p.seat === p.order && v.role === 'raider' && p.seat !== 'engine' && p.seat !== 'shield') {
        input = neutralRescueInput(s.tick); input.aimX = s.ship.x - v.ship.x; input.aimY = s.ship.y - v.ship.y
        if (distance < 29) input.buttons = RESCUE_BUTTON.fire
      }
      interactCrew(npc, p, input); advanceRescueCrew(p, input, dt)
      const before = npc.bullets.length
      operateRescueStation(npc, p, input, dt)
      if (v.role === 'raider') for (const bullet of npc.bullets.slice(before)) { bullet.enemy = true; bullet.owner = `vessel-${v.id}`; bullet.damage = 1; bullet.vx *= .35; bullet.vy *= .35; bullet.life = 5; const gun = npc.stations.find(st => st.id === p.seat); if (gun) gun.cooldown = Math.max(.95, gun.cooldown) }
      p.lastButtons = input.buttons; p.lastSeq = input.seq
    }
    advanceRescueShip(npc, dt)
    s.nextId = npc.nextId; s.events.push(...npc.events.filter(e => !['lose', 'win'].includes(e.kind)))
    s.guardianDefeated ||= npc.guardianDefeated
    s.stats.kills += Math.max(0, npc.stats.kills - s.stats.kills); s.campaign.salvage += Math.max(0, npc.campaign.salvage - s.campaign.salvage)
    const dx = v.ship.x - s.ship.x, dy = v.ship.y - s.ship.y, d = Math.max(.01, Math.hypot(dx, dy))
    if (d < HULL_RADIUS * 2 + .5) { v.ship.x = s.ship.x + dx / d * (HULL_RADIUS * 2 + .5); v.ship.y = s.ship.y + dy / d * (HULL_RADIUS * 2 + .5); v.ship.vx *= .2; v.ship.vy *= .2 }
    if (!v.visited && distance < 15) {
      v.visited = true
      if (v.role !== 'raider') { s.campaign.salvage += v.role === 'merchant' ? 12 : 5; rescueEvent(s, 'ability', v.ship.x, v.ship.y, 0, 2, v.role === 'merchant' ? 12 : 5, v.name) }
    }
  }
  if (s.events.length > 80) s.events = s.events.slice(-80)
}

export function advanceRescueShip(s: RescueState, dt: number) {
  const ship = s.ship, engine = s.stations.find(v => v.id === 'engine')!
  const drag = engine.upgrade === 'beam' ? .20 : 1.15
  ship.vx *= Math.exp(-drag * dt); ship.vy *= Math.exp(-drag * dt)
  const speed = Math.hypot(ship.vx, ship.vy), cap = (engine.upgrade === 'power' ? 15 : engine.upgrade === 'beam' ? 14 : 11) * (1 + s.campaign.upgrades.drive * .08)
  if (speed > cap) { ship.vx *= cap / speed; ship.vy *= cap / speed }
  let remaining = dt
  const solids = [...s.world.obstacles, ...s.world.cages.filter(c => !c.open).map(c => ({ ...c, radius: 1.2, style: -1 }))]
  for (let iteration = 0; iteration < 4 && remaining > 1e-7; iteration++) {
    const nx = ship.x + ship.vx * remaining, ny = ship.y + ship.vy * remaining
    let first = 1, obstacle: typeof s.world.obstacles[number] | null = null
    for (const o of solids) { const t = segmentCircle(ship.x, ship.y, nx, ny, o.x, o.y, HULL_RADIUS + o.radius); if (t !== null && t < first) { first = t; obstacle = o } }
    if (!obstacle) { ship.x = nx; ship.y = ny; break }
    ship.x += ship.vx * remaining * first; ship.y += ship.vy * remaining * first
    const dx = ship.x - obstacle.x, dy = ship.y - obstacle.y, distance = Math.max(.001, Math.hypot(dx, dy)), ux = dx / distance, uy = dy / distance
    const impact = ship.vx * ux + ship.vy * uy
    if (impact < -7 && obstacle.style >= 0) damageRescueShip(s, 1, obstacle.x, obstacle.y)
    ship.x = obstacle.x + ux * (HULL_RADIUS + obstacle.radius + .002); ship.y = obstacle.y + uy * (HULL_RADIUS + obstacle.radius + .002)
    if (impact < 0) { ship.vx -= impact * ux; ship.vy -= impact * uy }
    remaining *= 1 - first
  }
  const boundX = s.world.width / 2 - HULL_RADIUS, boundY = s.world.height / 2 - HULL_RADIUS
  if (Math.abs(ship.x) > boundX) { ship.x = clampRescue(ship.x, -boundX, boundX); ship.vx = 0 }
  if (Math.abs(ship.y) > boundY) { ship.y = clampRescue(ship.y, -boundY, boundY); ship.vy = 0 }
  ship.angle = 0; ship.angularVelocity = 0
  s.stats.travel += Math.hypot(ship.vx, ship.vy) * dt
}

function advanceObjectives(s: RescueState, dt: number) {
  for (const cage of s.world.cages) if (cage.open && !cage.rescued && Math.hypot(cage.x - s.ship.x, cage.y - s.ship.y) < 9 + s.campaign.upgrades.tractor * 2) {
    cage.rescued = true; s.stats.rescues++; s.ship.hp = Math.min(s.ship.maxHp, s.ship.hp + 1)
    s.campaign.salvage += 8; recruitRescueCrew(s, String(cage.id), cage.pet)
    rescueEvent(s, 'rescue', cage.x, cage.y, 0, 1, s.stats.rescues)
  }
  for (const gift of s.world.gifts) if (!gift.opened && Math.hypot(gift.x - s.ship.x, gift.y - s.ship.y) < HULL_RADIUS + 1) openRescueGift(s, gift.id)
  if (s.stats.rescues === 5 && !s.guardianSpawned) {
    s.guardianSpawned = true
    if (s.enemies.length >= 12) s.enemies.pop()
    spawnRescueEnemy(s, 'guardian', s.world.portal.x + 13, s.world.portal.y + 13)
    rescueEvent(s, 'guardian', s.world.portal.x + 13, s.world.portal.y + 13, 0, 4)
  }
  if (s.stats.rescues === 5 && s.guardianDefeated && Math.hypot(s.world.portal.x - s.ship.x, s.world.portal.y - s.ship.y) < 7) {
    s.extraction += dt
    if (s.extraction >= 1.5) { s.phase = 'won'; s.campaign.salvage += 30; if (!s.campaign.completed.includes(s.biome)) s.campaign.completed.push(s.biome); rescueEvent(s, 'win') }
  } else s.extraction = 0
  if (s.time >= s.nextWave && !s.guardianSpawned) {
    s.nextWave = s.time + 16 + rescueRandom(s) * 8
    const count = 2 + Math.min(2, Math.floor(s.stats.rescues / 2))
    for (let i = 0; i < count && s.enemies.length < 7 + s.biome; i++) {
      const angle = rescueRandom(s) * Math.PI * 2, kinds = s.biome === 0 ? ['moth', 'beetle', 'jelly'] as const : s.biome === 1 ? ['sentinel', 'beetle', 'needle'] as const : ['needle', 'jelly', 'moth'] as const
      spawnRescueEnemy(s, kinds[Math.floor(rescueRandom(s) * kinds.length)]!, s.ship.x + Math.cos(angle) * 22, s.ship.y + Math.sin(angle) * 22)
    }
  }
}

/** One authoritative clock; a solo command slows BOTH physics contexts together. */
export function advanceRescueGame(s: RescueState, inputs: Record<string, RescueInput>, step = RESCUE_STEP) {
  if (s.story?.pending) { s.events = []; return }
  if (s.phase === 'won') { advanceRescueStory(s); s.events = []; return }
  if (s.phase !== 'playing' || s.paused || s.docked) { s.events = []; return }
  const slow = s.solo && s.crew.some(p => !p.pet && Boolean(inputs[p.id]?.buttons && (inputs[p.id]!.buttons & RESCUE_BUTTON.command)))
  const dt = clampRescue(step, 0, 1 / 30) * (slow ? .16 : 1)
  s.tick++; s.time += dt; s.events = []; s.ship.thrust = 0; s.ship.invulnerable = Math.max(0, s.ship.invulnerable - dt)
  advanceRescueAbilities(s, dt)
  for (const station of s.stations) {
    const operator = s.crew.find(p => p.seat === station.id)
    const rate = (s.meal.remaining > 0 ? 1.2 : 1) * (operator?.ability === 'spark' ? 1.2 : 1) * (1 + s.campaign.upgrades.reactor * .1)
    station.operated = false; station.firing = false; station.cooldown = Math.max(0, station.cooldown - dt * rate); station.heat = Math.max(0, station.heat - dt * .19 * rate); station.lingering = Math.max(0, station.lingering - dt)
  }
  const assisted = Object.values(inputs).some(input => input.active && input.assist && validRescueInput(input))
  for (const p of s.crew) {
    const raw = inputs[p.id]
    let input = p.pet ? { ...petRescueInput(s, p, dt, assisted), assist: assisted } : raw?.active && validRescueInput(raw) ? raw : neutralRescueInput(Math.max(0, p.lastSeq))
    if (!p.pet && input.command && input.seq > p.commandSeq) {
      p.commandSeq = input.seq
      const crew = input.assist && input.commandCrew === p.id ? p : s.crew.find(c => c.pet && (!input.commandCrew || c.id === input.commandCrew))
      const occupant = s.crew.find(c => c.id !== crew?.id && (c.seat === input.command || (c.pet || c.commandSeq >= 0) && c.order === input.command))
      if (crew && (!occupant || occupant.pet)) {
        if (occupant?.pet) {
          const free = s.stations.find(st => st.id !== input.command && !s.crew.some(c => c.id !== occupant.id && (c.seat === st.id || c.order === st.id)))
          // A full crew can still swap jobs: use the human's vacated seat, or
          // wait near another station when every seat is currently occupied.
          occupant.order = free?.id ?? (crew.seat && crew.seat !== input.command ? crew.seat : input.command === 'galley' ? 'map' : 'galley')
          occupant.route = []; occupant.commandSeq = input.seq
        }
        crew.order = input.command; crew.route = []; crew.commandSeq = input.seq
        rescueEvent(s, 'order', s.ship.x, s.ship.y, 0, 1, 0, input.command)
      }
    }
    if (!p.pet && input.assist) {
      const seq = input.seq
      if (p.seat !== p.order) input = { ...routeRescueCrew(p, p.order, s.tick, dt), seq, assist: true }
      else if (p.seat !== 'engine') input = { ...petRescueInput(s, p, dt, true), seq, assist: true }
    }
    interactCrew(s, p, input)
    advanceRescueCrew(p, input, dt, s.meal.remaining > 0 ? 1.2 : 1)
    operateRescueStation(s, p, input, dt)
    p.lastButtons = input.buttons; p.lastSeq = input.seq
  }
  for (const station of s.stations) if (!station.operated) station.charge = Math.max(0, station.charge - dt)
  if (assisted) {
    for (const gem of s.gems) if (!gem.socket && !gem.heldBy) {
      const targets = gem.kind === 'metal' ? ['engine', 'shield'] : ['east', 'north', 'south', 'west', 'starburst']
      const free = s.stations.filter(st => targets.includes(st.id) && !st.upgrade).sort((a, b) => Number(b.operated) - Number(a.operated))[0]
      if (free) socketGem(s, gem.id, free.id)
    }
  }
  advanceGems(s, dt); advanceRescueWeather(s, dt); advanceRescueShip(s, dt); advanceRescueVessels(s, dt); advanceRescueEnemies(s, dt); advanceRescueBullets(s, dt)
  if (s.phase === 'playing') advanceObjectives(s, dt)
  advanceRescueStory(s)
  if (s.tick % 30 === 0) {
    const map = s.stations.find(v => v.id === 'map')!
    revealRescueFog(s.world, s.ship, map.operated ? map.upgrade === 'power' ? 44 : 30 : 19)
    if (map.operated && map.upgrade === 'beam') for (const cage of s.world.cages) revealRescueFog(s.world, cage, 6)
    if (map.operated && map.upgrade === 'metal') revealRescueFog(s.world, s.world.portal, 14)
  }
}
