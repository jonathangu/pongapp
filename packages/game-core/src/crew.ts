import { CREW_UPGRADES, RECOVERY_SCRAP, RECOVERY_TAPS, RECOVERY_WORK, expeditionWorld, type CoopGameState, type CoopInputs, type CrewShot, type CrewUpgrade, type RiverObject, type RiverObjectType } from './coop'
import { orbitDelta, orbitDistance, wrapOrbit } from './orbit'

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
function random(s: CoopGameState) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 0x1_0000_0000 }
function say(s: CoopGameState, message: string) { s.events.push({ type: 'crew', message }) }
const MAX_OBJECTS = 80, MAX_SHOTS = 48, MAX_EXPLOSIONS = 16
function spawn(s: CoopGameState, type: RiverObjectType, x = s.boat.x + (random(s)-.5)*1.1, y = -.08): RiverObject {
  const o: RiverObject = { id: s.nextObjectId++, type, x: wrapOrbit(x), y, radius: type === 'rock' || type === 'log' ? .033 : .024, phase: random(s) * 6.28, drift: 0 }
  if (s.objects.length < MAX_OBJECTS) s.objects.push(o)
  return o
}
function enemy(s: CoopGameState, kind: 'chaser' | 'ambusher' | 'boss', offset = 0) {
  if (kind !== 'boss' && s.objects.filter(o => o.type === 'predator').length >= 22) return
  if (kind === 'boss' && s.objects.length >= MAX_OBJECTS) s.objects.pop()
  const o = spawn(s, 'predator', s.boat.x + (kind === 'boss' ? 0 : kind === 'chaser' ? offset : offset < 0 ? -.52 : .52), kind === 'boss' ? .19 : kind === 'chaser' ? 1.02 : .22 + random(s) * .16)
  o.enemy = kind; o.age = 0; o.radius = kind === 'boss' ? .09 : .039
  o.hp = o.maxHp = kind === 'boss' ? 180 : kind === 'chaser' ? 5 : 4
  o.targetX = s.boat.x; o.targetY = .76
}
function targets(s: CoopGameState) {
  return s.objects.filter(o => o.type === 'predator' && (o.hp ?? 1) > 0 && o.y > -.05 && o.y < 1.12)
    .filter(o => Math.abs(orbitDelta(o.x,s.boat.x)) < 1.3)
    .sort((a, b) => (a.id === s.crew.targetId ? -10 : orbitDistance(a.x,a.y,s.boat.x,.76)) - (b.id === s.crew.targetId ? -10 : orbitDistance(b.x,b.y,s.boat.x,.76)))
}
function launch(s: CoopGameState, ownerId: string, target: RiverObject | undefined, power: boolean, secondary = false) {
  const c = s.crew
  if (c.shots.length >= MAX_SHOTS) return
  const side = s.players[ownerId]?.side === 'left' ? -1 : 1
  const x = wrapOrbit(s.boat.x + side * (secondary ? -.024 : .024)), y = .725
  const toX = target?.x ?? wrapOrbit(x + (secondary ? .09 : 0)), toY = target?.y ?? -.12
  const dx=orbitDelta(toX,x),length = Math.max(.001, Math.hypot(dx, toY - y)), speed = .016
  c.shots.push({ id: s.nextObjectId++, ownerId, targetId: target?.id ?? null, x, y, fromX: x, fromY: y, toX, toY, vx: dx / length * speed, vy: (toY - y) / length * speed, ticks: 100, life: 100, damage: (power?14:7)*(secondary?.7:1), radius: power?.2:.145, kind: power?'manual':'auto' })
  c.shotsFired++
}
function explode(s: CoopGameState, shot: CrewShot) {
  const c = s.crew
  c.explosions.push({ id: s.nextObjectId++, x: shot.x, y: shot.y, radius: shot.radius, ticks: 38, life: 38, kind: 'blast' })
  for (const o of s.objects) {
    if (o.type !== 'predator' || (o.hp ?? 1) <= 0) continue
    const distance = orbitDistance(o.x,o.y,shot.x,shot.y)
    if (distance <= shot.radius + o.radius) {
      o.hp = (o.hp ?? 4) - shot.damage * (1 - .3 * Math.min(1, distance / shot.radius))
      if (c.upgrades.includes('frost')) o.slowTicks = 100
    } else if (c.upgrades.includes('chain') && distance < shot.radius * 1.75) {
      o.hp = (o.hp ?? 4) - 2
      c.explosions.push({ id: s.nextObjectId++, x: o.x, y: o.y, radius: .07, ticks: 24, life: 24, kind: 'chain' })
    }
  }
  c.explosions = c.explosions.slice(-MAX_EXPLOSIONS)
}

/** Ruleset 9: full-circumference movement, comfortable holds and stronger tap accents. */
export function advanceCrew(s: CoopGameState, inputs: CoopInputs): void {
  if (s.phase === 'finished') { s.events = []; s.tick++; return }
  s.tick++; s.events = []
  const c = s.crew
  if (s.phase === 'countdown') {
    if (--s.countdownTicks <= 0) { s.phase = 'playing'; s.events.push({ type: 'tripStart' }) }
    return
  }
  const elapsed = s.tick - 180, world = expeditionWorld(s)
  for (const key of ['shieldTicks', 'shieldCooldown', 'boostCooldown', 'shotCooldown'] as const) c[key] = Math.max(0, c[key] - 1)
  s.invulnerableTicks = Math.max(0, s.invulnerableTicks - 1)
  s.rushTicks = Math.max(0, s.rushTicks - 1); s.flareTicks = Math.max(0, s.flareTicks - 1)
  c.explosions = c.explosions.filter(e => --e.ticks > 0)
  c.heat = 0; c.overheated = false; c.choiceTicks = 0; c.swap = null
  let steer = 0,heldSteer=0
  const gunners:string[]=[]
  // Stable player order makes simultaneous repairs and taps identical on both peers.
  for (const p of Object.values(s.players).sort((a, b) => a.side.localeCompare(b.side))) {
    const input = inputs[p.id]
    const counts = c.actions[p.id] ??= { left: 0, right: 0, shoot: 0, recover: 0 }
    if (input?.leftTap) { steer--; counts.left++ }
    if (input?.rightTap) { steer++; counts.right++ }
    heldSteer += clamp(input?.steer??0,-1,1)
    if(input?.action)gunners.push(p.id)
    if (input?.targetId !== undefined) c.targetId = input.targetId
    if (input?.shootTap && c.pendingShots.length < 6) { c.pendingShots.push(p.id); counts.shoot++ }
    if ((input?.recoverTap || input?.recoverHeld) && s.hearts < 3) {
      if(input.recoverTap){counts.recover++;c.repair+=RECOVERY_WORK/RECOVERY_TAPS}
      else if(input.recoverHeld)c.repair+=c.scrap>=RECOVERY_SCRAP?1.5:1
      if (c.repair >= RECOVERY_WORK) {
        c.scrap = Math.max(0,c.scrap-RECOVERY_SCRAP); s.hearts++; c.repair = 0
        s.events.push({ type: 'healed', x: s.boat.x, y: .76 }); say(s, 'RECOVERED +1 HEART')
      }
    }
  }
  if (s.hearts >= 3) c.repair = 0
  s.boat.heading = clamp(s.boat.heading*.76 + clamp(heldSteer,-1,1)*.00624 + steer*.06,-.09,.09)
  s.boat.x = wrapOrbit(s.boat.x + s.boat.heading)
  if (Math.abs(s.boat.heading) < .00001) s.boat.heading = 0
  s.paddles.left = steer+heldSteer < 0 ? 1 : s.paddles.left * .8
  s.paddles.right = steer+heldSteer > 0 ? 1 : s.paddles.right * .8
  s.boat.speed += (.009 - s.boat.speed) * .2
  s.boat.wake = .6 + Math.min(.4, Math.abs(s.boat.heading) * 25); s.distance += s.boat.speed * 8
  s.harmony = 0

  // Automatic field upgrades never pause play or ask either player to open a menu.
  const milestones: Array<[number, CrewUpgrade]> = [[1080, 'twin'], [2520, 'frost'], [3960, 'magnet'], [5400, 'chain'], [6480, 'bubble']]
  for (const [tick, upgrade] of milestones) if (elapsed >= tick && !c.upgrades.includes(upgrade)) {
    c.upgrades.push(upgrade); c.choice++; c.scrap += 2
    if (upgrade === 'bubble') c.bubble = 1
    say(s, `${CREW_UPGRADES.find(u => u.id === upgrade)!.name.toUpperCase()} AUTO-EQUIPPED`)
  }
  if (elapsed % 60 === 0) spawn(s, 'firefly')
  if (elapsed % 155 === 0) spawn(s, world === 2 ? 'log' : 'rock')
  if (elapsed >= 120 && elapsed % (world >= 3 ? 66 : 84) === 0) {
    const wave = Math.floor(elapsed / 84)
    enemy(s, wave % 3 ? 'ambusher' : 'chaser', -.15)
    enemy(s, wave % 2 ? 'chaser' : 'ambusher', .15)
  }
  if (elapsed % 360 === 0) spawn(s, 'rescue', s.boat.x+(random(s)-.5)*.65)
  if (elapsed % 260 === 0) spawn(s, 'relic')
  if (elapsed % 660 === 0) spawn(s, 'gate')
  if (elapsed >= 5760 && !c.bossSpawned) { enemy(s, 'boss'); c.bossSpawned = true; say(s, 'STAR DEVOURER · UNLEASH YOUR CANNONS!') }

  for (const o of s.objects) {
    o.phase += .05
    if (o.type !== 'predator') { o.y += s.boat.speed; if (o.type === 'log') o.x = wrapOrbit(o.x+Math.sin(o.phase)*.0015); continue }
    o.age = (o.age ?? 0) + 1; o.hp ??= 4; o.maxHp ??= o.hp; o.enemy ??= 'ambusher'
    o.slowTicks = Math.max(0, (o.slowTicks ?? 0) - 1)
    const slow = o.slowTicks ? .5 : 1, age = o.age
    if (o.enemy === 'boss') {
      o.x = wrapOrbit(o.x+clamp(orbitDelta(s.boat.x,o.x),-.022,.022)); o.y = .19 + Math.sin(age / 70) * .035
      const cycle = age % 180
      if (cycle === 1) o.targetX = s.boat.x
      if (cycle === 70) { const rock = spawn(s, 'rock', o.targetX, .28); rock.radius = .045 }
    } else if (o.enemy === 'chaser') {
      if (age < 50) { o.y = .97; o.x = wrapOrbit(o.x+orbitDelta(s.boat.x,o.x)*.045) }
      if (age === 50) { o.targetX = s.boat.x; o.targetY = .46 }
      if (age >= 50) { o.y -= .0058 * slow; o.x = wrapOrbit(o.x+clamp(orbitDelta(o.targetX??o.x,o.x),-.008,.008)*slow) }
    } else {
      if (age <= 55) { o.targetX = s.boat.x; o.targetY = .79 }
      else { if(age===56)o.drift=orbitDelta(o.targetX??o.x,o.x)/65; o.x=wrapOrbit(o.x+o.drift*slow); o.y += .006 * slow }
    }
  }

  const flying: CrewShot[] = []
  for (const shot of c.shots) {
    const target = s.objects.find(o => o.id === shot.targetId && (o.hp ?? 0) > 0)
    if (target) {
      shot.toX = target.x; shot.toY = target.y
      const dx=orbitDelta(target.x,shot.x),d = Math.max(.001, Math.hypot(dx, target.y - shot.y))
      shot.vx += (dx / d * .016 - shot.vx) * .2
      shot.vy += ((target.y - shot.y) / d * .016 - shot.vy) * .2
    }
    shot.x = wrapOrbit(shot.x+shot.vx); shot.y += shot.vy; shot.ticks--
    const impact = s.objects.some(o => o.type === 'predator' && (o.hp ?? 1) > 0 && orbitDistance(o.x,o.y,shot.x,shot.y) < o.radius + .025)
    if (impact || shot.ticks <= 0 || shot.y < -.16 || shot.y > 1.2) explode(s, shot)
    else flying.push(shot)
  }
  c.shots = flying
  if (!c.shotCooldown && (c.pendingShots.length||gunners.length) && c.shots.length < MAX_SHOTS - 1) {
    const power=c.pendingShots.length>0,owner = c.pendingShots.shift() ?? gunners[Math.floor(elapsed/8)%gunners.length]!, enemies = targets(s)
    launch(s, owner, enemies[0],power)
    if (c.upgrades.includes('twin')) launch(s, owner, enemies[1] ?? enemies[0],power,true)
    c.shotCooldown = power?4:8
  }

  const survivors: RiverObject[] = []
  for (const o of s.objects) {
    if (o.type === 'predator' && (o.hp ?? 1) <= 0) {
      c.kills++; c.scrap++; s.score += o.enemy === 'boss' ? 1000 : 90
      if (o.enemy === 'boss') { c.bossDefeated = true; say(s, 'DEVOURER DOWN · BRING YOUR FRIENDS HOME!') }
      s.events.push({ type: 'smashed', value: 90, x: o.x, y: o.y }); continue
    }
    const hazard = o.type === 'rock' || o.type === 'log' || o.type === 'predator'
    if (!hazard && c.upgrades.includes('magnet') && Math.abs(o.y - .76) < .28 && Math.abs(orbitDelta(o.x,s.boat.x))<.6) o.x = wrapOrbit(o.x+orbitDelta(s.boat.x,o.x)*.12)
    const collided = orbitDistance(o.x,o.y,s.boat.x,.76) < o.radius + .04
    if (collided && o.enemy !== 'boss') {
      if (hazard) {
        if (c.shieldTicks || c.bubble) { if (!c.shieldTicks) c.bubble--; say(s, 'BUBBLE BLOCKED THE HIT'); s.score += 25 }
        else if (!s.invulnerableTicks) { s.hearts--; s.streak = 0; s.invulnerableTicks = 90; s.events.push({ type: 'crash', x: o.x, y: o.y }) }
      } else if (o.type === 'rescue') { s.rescued++; s.score += 120; s.events.push({ type: 'rescued', x: o.x, y: o.y }) }
      else if (o.type === 'relic') { s.relics++; c.scrap += 2; s.score += 50; s.events.push({ type: 'relic', x: o.x, y: o.y }) }
      else if (o.type === 'heart') { s.hearts = Math.min(3, s.hearts + 1); s.events.push({ type: 'healed', x: o.x, y: o.y }) }
      else if (o.type === 'gate') { s.gates++; s.score += 100; say(s, 'GATE CLEARED +100') }
      else { s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); s.score += 10 + Math.min(s.streak, 30) }
      continue
    }
    if (o.y > -.3 && o.y < 1.3 && (o.enemy !== 'chaser' || (o.age ?? 0) < 230)) survivors.push(o)
  }
  s.objects = survivors.slice(-MAX_OBJECTS); c.scrap = Math.min(30, c.scrap)
  c.victory = c.bossDefeated && s.rescued >= 3 && s.hearts > 0
  if (c.victory || s.hearts <= 0 || elapsed >= s.durationTicks) {
    s.phase = 'finished'; c.finishedTick = s.tick; s.hearts = Math.max(0, s.hearts)
    s.events.push({ type: 'tripFinished', score: s.score, distance: s.distance })
  }
}
