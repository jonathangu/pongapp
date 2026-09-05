import { CREW_UPGRADES, expeditionWorld, type CoopGameState, type CoopInputs, type RiverObject, type RiverObjectType } from './coop'

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
function random(s: CoopGameState) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 0x1_0000_0000 }
function say(s: CoopGameState, message: string) { s.events.push({ type: 'crew', message }) }
function spawn(s: CoopGameState, type: RiverObjectType, x = .15 + random(s) * .7, y = -.08): RiverObject {
  const o: RiverObject = { id: s.nextObjectId++, type, x, y, radius: type === 'rock' || type === 'log' ? .045 : .03, phase: random(s) * 6.28, drift: 0 }
  s.objects.push(o); return o
}
function enemy(s: CoopGameState, kind: 'chaser' | 'ambusher' | 'boss') {
  const o = spawn(s, 'predator', kind === 'boss' ? .5 : kind === 'chaser' ? s.boat.x : random(s) > .5 ? .93 : .07, kind === 'boss' ? .16 : kind === 'chaser' ? 1.06 : .3)
  o.enemy = kind; o.age = 0; o.radius = kind === 'boss' ? .12 : .055
  o.hp = o.maxHp = kind === 'boss' ? 85 : kind === 'chaser' ? 5 : 4
  o.targetX = s.boat.x; o.targetY = .76
}

/** Fixed-tick crew rules. Rendering and transport never decide combat outcomes. */
export function advanceCrew(s: CoopGameState, inputs: CoopInputs): void {
  // Keep snapshot ticks monotonic after finishing so terminal state/rematches reach peers.
  if (s.phase === 'finished') { s.events = []; s.tick++; return }
  s.tick++; s.events = []
  const c = s.crew
  // Stable seat order resolves simultaneous station and upgrade requests identically.
  const players = Object.values(s.players).sort((a, b) => a.side.localeCompare(b.side))
  if (c.swap && c.swap.expires < s.tick) c.swap = null
  for (const p of players) {
    const input = inputs[p.id]
    const station = input?.station
    if (station && ['pilot', 'gunner', 'engineer'].includes(station) && station !== p.station) {
      const owner = players.find(other => other.station === station)
      if (!owner) { p.station = station; c.swap = null; say(s, `${p.name}: ${station}`) }
      else if (c.swap?.from === owner.id && c.swap.to === p.id) {
        owner.station = p.station; p.station = station; c.swap = null; say(s, 'Stations swapped!')
      } else { c.swap = { from: p.id, to: owner.id, expires: s.tick + 360 }; say(s, `${p.name} requests a swap`) }
    }
    if (input?.upgrade && c.choiceTicks > 0 && c.upgrades.length < 2 && !c.upgrades.includes(input.upgrade) && CREW_UPGRADES.some(u => u.id === input.upgrade)) {
      c.upgrades.push(input.upgrade); c.choiceTicks = 0
      if (input.upgrade === 'bubble') c.bubble = 1
      say(s, `${CREW_UPGRADES.find(u => u.id === input.upgrade)!.name} equipped`)
    }
  }
  if (s.phase === 'countdown') {
    if (--s.countdownTicks <= 0) { s.phase = 'playing'; s.events.push({ type: 'tripStart' }) }
    return
  }
  const elapsed = s.tick - 180, world = expeditionWorld(s)
  const pilot = players.find(p => p.station === 'pilot'), gunner = players.find(p => p.station === 'gunner'), engineer = players.find(p => p.station === 'engineer')
  const drive = pilot ? inputs[pilot.id] : undefined, gun = gunner ? inputs[gunner.id] : undefined, repair = engineer ? inputs[engineer.id] : undefined
  for (const key of ['shieldTicks', 'shieldCooldown', 'boostCooldown', 'shotCooldown', 'choiceTicks'] as const) c[key] = Math.max(0, c[key] - 1)
  s.invulnerableTicks = Math.max(0, s.invulnerableTicks - 1); s.rushTicks = Math.max(0, s.rushTicks - 1)
  s.flareTicks = Math.max(0, s.flareTicks - 1); s.lanternTicks = Math.max(0, s.lanternTicks - 1)
  if (drive?.flare && !c.boostCooldown) { s.rushTicks = 65; c.boostCooldown = 360; say(s, 'BOOST · not invincible!') }
  if (repair?.flare && !c.shieldCooldown) { c.shieldTicks = 75; c.shieldCooldown = 420; s.flareTicks = 60; say(s, 'SHIELD UP') }
  s.flareCooldown = c.shieldCooldown
  if (repair?.action && c.scrap >= 3 && s.hearts < 3) {
    c.repair++
    if (c.repair >= 110) { c.scrap -= 3; s.hearts++; c.repair = 0; s.events.push({ type: 'healed', x: s.boat.x, y: .76 }); say(s, 'Hull repaired +1') }
  } else c.repair = Math.max(0, c.repair - 2)
  const manual = Boolean(gun?.action) && !c.overheated
  // Taking over an auto-turret must not inherit its much slower firing interval.
  if (manual) c.shotCooldown = Math.min(12, c.shotCooldown)
  c.heat = clamp(c.heat + (manual ? .52 : -.42), 0, 100)
  if (c.heat >= 100) { c.overheated = true; say(s, 'Turrets hot! Release to cool') }
  if (c.heat < 25) c.overheated = false
  if (gun?.targetId !== undefined) c.targetId = gun.targetId
  const steer = clamp(drive?.steer ?? 0, -1, 1)
  s.paddles = { left: steer < 0 ? 1 : 0, right: steer > 0 ? 1 : 0 }
  s.boat.heading += (steer * .0105 - s.boat.heading) * .28
  // Subtle crosswind makes the sky chapter mechanically distinct; steering overcomes it.
  const wind = world === 3 ? Math.sin(elapsed / 110) * .0008 : 0
  s.boat.x = clamp(s.boat.x + s.boat.heading + wind, .1, .9)
  s.boat.speed += ((s.rushTicks ? .019 : .0125) - s.boat.speed) * .2
  s.boat.wake = s.rushTicks ? 1 : .65; s.distance += s.boat.speed * 8
  s.harmony = c.heat // Retained field for old diagnostics; HUD labels this as heat.

  // Short resupply intervals provide room to breathe and choose a shared build.
  if ((elapsed === 1080 || elapsed === 2520) && c.upgrades.length < 2) { c.choice++; c.choiceTicks = 480; c.scrap += 2; say(s, 'RESUPPLY · choose a team upgrade') }
  if (elapsed % 1440 === 0 && c.upgrades.includes('bubble')) c.bubble = 1
  const resupply = elapsed % 1440 > 1020
  if (elapsed % 65 === 0) spawn(s, 'firefly')
  if (elapsed % 140 === 0 && !resupply) spawn(s, world === 2 ? 'log' : 'rock')
  if (elapsed > 300 && elapsed % (world >= 3 ? 160 : 200) === 0 && !resupply) enemy(s, Math.floor(elapsed / 200) % 2 ? 'ambusher' : 'chaser')
  if (elapsed % 420 === 0) spawn(s, 'rescue', .22 + random(s) * .56)
  if (elapsed % 310 === 0) spawn(s, 'relic')
  if (elapsed % 660 === 0) spawn(s, 'gate')
  if (elapsed >= 5760 && !c.bossSpawned) { enemy(s, 'boss'); c.bossSpawned = true; say(s, 'STAR DEVOURER · shoot the core!') }

  for (const o of s.objects) {
    o.phase += .05
    if (o.type !== 'predator') { o.y += s.boat.speed; if (o.type === 'log') o.x += Math.sin(o.phase) * .002; continue }
    o.age = (o.age ?? 0) + 1; o.hp ??= 4; o.maxHp ??= o.hp; o.enemy ??= 'ambusher'
    o.slowTicks = Math.max(0, (o.slowTicks ?? 0) - 1)
    const slow = o.slowTicks ? .45 : 1
    const age = o.age
    if (o.enemy === 'boss') {
      o.x = .5 + Math.sin(age / 100) * .27; o.y = .19 + Math.sin(age / 70) * .035
      const cycle = age % 200
      if (cycle === 1) o.targetX = s.boat.x
      if (cycle === 80) { const rock = spawn(s, 'rock', o.targetX, .28); rock.radius = .06 }
    } else if (o.enemy === 'chaser') {
      if (age < 55) { o.y = .98; o.x += (s.boat.x - o.x) * .055 }
      if (age === 55) { o.targetX = s.boat.x; o.targetY = .52 }
      if (age >= 55) { o.y -= .0075 * slow; o.x += clamp((o.targetX ?? o.x) - o.x, -.006, .006) * slow }
    } else {
      if (age <= 50) { o.targetX = s.boat.x; o.targetY = .79 }
      else { o.x += ((o.targetX ?? .5) - (o.drift || (o.drift = o.x))) / 55 * slow; o.y += .009 * slow }
    }
  }

  // Hitscan combat uses short-lived visual beams. No projectile packet stream.
  c.shots = c.shots.filter(shot => --shot.ticks > 0)
  if (c.shotCooldown <= 0 && !c.overheated) {
    const targets = s.objects.filter(o => o.type === 'predator' && (o.hp ?? 1) > 0 && o.y > .05 && o.y < 1.1)
      .sort((a, b) => (a.id === c.targetId ? -10 : Math.abs(a.y - .76)) - (b.id === c.targetId ? -10 : Math.abs(b.y - .76)))
    const first = targets[0]
    if (first) {
      c.shotCooldown = manual ? 12 : 55
      const hit = (o: RiverObject, damage: number, kind: 'auto' | 'manual' | 'chain') => {
        o.hp = (o.hp ?? 4) - damage
        if (c.upgrades.includes('frost')) o.slowTicks = 65
        c.shots.push({ id: s.nextObjectId++, x: s.boat.x, y: .73, toX: o.x, toY: o.y, ticks: 8, kind })
      }
      hit(first, manual ? 1.7 : .75, manual ? 'manual' : 'auto')
      if (targets[1] && c.upgrades.includes('twin')) hit(targets[1], manual ? 1.2 : .5, manual ? 'manual' : 'auto')
      if (c.upgrades.includes('chain')) for (const next of targets.slice(1, 4)) if (Math.hypot(next.x - first.x, next.y - first.y) < .4) hit(next, .8, 'chain')
    }
  }
  const survivors: RiverObject[] = []
  for (const o of s.objects) {
    if (o.type === 'predator' && (o.hp ?? 1) <= 0) {
      c.kills++; c.scrap++; s.score += o.enemy === 'boss' ? 1000 : 90
      if (o.enemy === 'boss') { c.bossDefeated = true; say(s, 'DEVOURER DOWN · bring your friends home!') }
      s.events.push({ type: 'smashed', value: 90, x: o.x, y: o.y }); continue
    }
    const hazard = o.type === 'rock' || o.type === 'log' || o.type === 'predator'
    if (!hazard && c.upgrades.includes('magnet') && Math.abs(o.y - .76) < .28) o.x += (s.boat.x - o.x) * .08
    const dx = o.x - s.boat.x, dy = o.y - .76
    const collided = Math.hypot(dx, dy) < o.radius + .045
    if (collided && o.enemy !== 'boss') {
      if (hazard) {
        if (c.shieldTicks || c.bubble) { if (!c.shieldTicks) c.bubble--; say(s, 'BLOCKED!'); s.score += 25 }
        else if (!s.invulnerableTicks) { s.hearts--; s.streak = 0; s.invulnerableTicks = 75; s.events.push({ type: 'crash', x: o.x, y: o.y }) }
      } else if (o.type === 'rescue') { s.rescued++; s.score += 120; s.events.push({ type: 'rescued', x: o.x, y: o.y }) }
      else if (o.type === 'relic') { s.relics++; c.scrap += 2; s.score += 50; s.events.push({ type: 'relic', x: o.x, y: o.y }) }
      else if (o.type === 'heart') { s.hearts = Math.min(3, s.hearts + 1); s.events.push({ type: 'healed', x: o.x, y: o.y }) }
      else if (o.type === 'gate') { s.gates++; s.score += 100; c.boostCooldown = 0; say(s, 'Gate cleared · boost ready') }
      else { s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); s.score += 10 + Math.min(s.streak, 30) }
      continue
    }
    if (o.y > -.3 && o.y < 1.3 && (o.enemy !== 'chaser' || (o.age ?? 0) < 200)) survivors.push(o)
  }
  s.objects = survivors
  c.scrap = Math.min(30, c.scrap)
  c.victory = c.bossDefeated && s.rescued >= 3 && s.hearts > 0
  if (c.victory || s.hearts <= 0 || elapsed >= s.durationTicks) {
    s.phase = 'finished'; c.finishedTick = s.tick; s.hearts = Math.max(0, s.hearts)
    s.events.push({ type: 'tripFinished', score: s.score, distance: s.distance })
  }
}
