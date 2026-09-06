import { CREW_UPGRADES, RECOVERY_SCRAP, RECOVERY_WORK, expeditionWorld, type CoopGameState, type CoopInputs, type CrewShot, type CrewUpgrade, type RiverObject, type RiverObjectType } from './coop'
import { assignStation, advanceCrewMember, operatingStation, arkHeading, ARK_WORLD_DEPTH } from './stations'
import { BEAST_TRAITS } from './bestiary'
import { orbitDelta, wrapOrbit } from './orbit'
import { ALTITUDE_EVENTS, ALTITUDE_SCALE, BOSS_ENCOUNTERS, advanceAltitude, bossWarning, combatDistance, objectAltitude } from './altitude'

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
function random(s: CoopGameState) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 0x1_0000_0000 }
function say(s: CoopGameState, message: string) { s.events.push({ type: 'crew', message }) }
const MAX_OBJECTS = 80, MAX_SHOTS = 48, MAX_EXPLOSIONS = 16
function spawn(s: CoopGameState, type: RiverObjectType, x = s.boat.x + (random(s)-.5)*1.1, y = -.08): RiverObject {
  const o: RiverObject = { id: s.nextObjectId++, type, x: wrapOrbit(x), y, radius: type === 'rock' || type === 'log' ? .033 : .024, phase: random(s) * 6.28, drift: 0 }
  if(type!=='predator'&&type!=='gate'){
    const rising=s.boat.altitude>1||o.id%5===0,peak=rising?Math.max(3,s.boat.altitude):6+o.id%4
    o.flight={kind:rising?'rise':'drop',tick:0,duration:rising?130:64,peak};o.altitude=rising?0:peak
  }
  if (s.objects.length < MAX_OBJECTS) s.objects.push(o)
  return o
}
function enemy(s: CoopGameState, kind: 'chaser' | 'ambusher' | 'boss', offset = 0) {
  if (kind !== 'boss' && s.objects.filter(o => o.type === 'predator').length >= 4) return
  if (kind === 'boss' && s.objects.length >= MAX_OBJECTS) s.objects.pop()
  const o = spawn(s, 'predator', s.boat.x + (kind === 'boss' ? 0 : kind === 'chaser' ? offset : offset < 0 ? -.52 : .52), kind === 'boss' ? .19 : kind === 'chaser' ? 1.02 : .22 + random(s) * .16)
  o.enemy = kind; o.age = 0; o.radius = kind === 'boss' ? .16 : .09
  o.hp = o.maxHp = kind === 'boss' ? 420 : kind === 'chaser' ? 72 : 90
  o.recipe=Math.floor(random(s)*s.voyage.monsters.length)
  const recipe=s.voyage.monsters[o.recipe]!
  o.family=recipe.family
  if(kind!=='boss'){o.hp=o.maxHp=BEAST_TRAITS[recipe.trait].hp;o.radius=.09*recipe.scale}
  o.attackPhase='stalk';o.attackTick=0
  o.targetX = s.boat.x; o.targetY = .76
  if(kind!=='boss'&&(o.id%3===0||s.boat.altitude>1)){
    const drop=o.id%2===0;o.flight={kind:drop?'drop':'rise',tick:0,duration:kind==='chaser'?105:115,peak:Math.max(4,s.boat.altitude)};o.altitude=drop?o.flight.peak:0
  }
  return o
}
function targets(s: CoopGameState) {
  return s.objects.filter(o => o.type === 'predator' && (o.hp ?? 1) > 0 && o.y > -.05 && o.y < 1.12)
    .filter(o => Math.abs(orbitDelta(o.x,s.boat.x)) < 1.3)
    .sort((a, b) => (a.id === s.crew.targetId ? -10 : combatDistance(a.x,a.y,objectAltitude(a),s.boat.x,.76,s.boat.altitude)) - (b.id === s.crew.targetId ? -10 : combatDistance(b.x,b.y,objectAltitude(b),s.boat.x,.76,s.boat.altitude)))
}
function launch(s: CoopGameState, ownerId: string, target: RiverObject | undefined, power: boolean, secondary = false) {
  const c = s.crew
  if (c.shots.length >= MAX_SHOTS) return
  const heading=arkHeading(s.boat.heading,s.boat.speed)
  const baseX=wrapOrbit(s.boat.x-Math.sin(heading)*2.32/14),baseY=.76-Math.cos(heading)*2.32/ARK_WORLD_DEPTH
  const wx=target?orbitDelta(target.x,baseX)*14:-Math.sin(heading),wz=target?(target.y-baseY)*ARK_WORLD_DEPTH:-Math.cos(heading),wy=target?objectAltitude(target)+.45-(s.boat.altitude+1.06):0
  const wl=Math.max(.001,Math.hypot(wx,wz,wy))
  const x=wrapOrbit(baseX+wx/wl*1.14/14),y=baseY+wz/wl*1.14/ARK_WORLD_DEPTH
  const toX = target?.x ?? wrapOrbit(x + (secondary ? .09 : 0)), toY = target?.y ?? -.12
  const altitude=s.boat.altitude+1.06+wy/wl*1.14,toAltitude=target?objectAltitude(target)+.45:altitude
  const dx=orbitDelta(toX,x),dz=(toAltitude-altitude)/ALTITUDE_SCALE,length = Math.max(.001, Math.hypot(dx, toY-y,dz)), speed = .016
  c.shots.push({ id: s.nextObjectId++, ownerId, targetId: target?.id ?? null, x, y, fromX: x, fromY: y, toX, toY, altitude,fromAltitude:altitude,toAltitude,vAltitude:dz/length*speed*ALTITUDE_SCALE,vx: dx / length * speed, vy: (toY - y) / length * speed, ticks: 100, life: 100, damage: 18*(secondary?.6:1), radius: .13, kind: power?'manual':'auto' })
  c.shotsFired++
}
function explode(s: CoopGameState, shot: CrewShot) {
  const c = s.crew
  c.explosions.push({ id: s.nextObjectId++, x: shot.x, y: shot.y, altitude:shot.altitude, radius: shot.radius, ticks: 38, life: 38, kind: 'blast' })
  for (const o of s.objects) {
    if (o.type !== 'predator' || (o.hp ?? 1) <= 0) continue
    const distance = combatDistance(o.x,o.y,objectAltitude(o)+.45,shot.x,shot.y,shot.altitude)
    if (distance <= shot.radius + o.radius) {
      o.hp = (o.hp ?? 4) - shot.damage * (1 - .3 * Math.min(1, distance / shot.radius))
      if (c.upgrades.includes('frost')) o.slowTicks = 100
    } else if (c.upgrades.includes('chain') && distance < shot.radius * 1.75) {
      o.hp = (o.hp ?? 4) - 2
      c.explosions.push({ id: s.nextObjectId++, x: o.x, y: o.y, altitude:objectAltitude(o)+.45, radius: .07, ticks: 24, life: 24, kind: 'chain' })
    }
  }
  c.explosions = c.explosions.slice(-MAX_EXPLOSIONS)
}

/** Ruleset11: two physical crew, four persistent stations, deliberate pursuing monsters. */
export function advanceCrew(s: CoopGameState, inputs: CoopInputs): void {
  if (s.phase === 'finished') { s.events = []; s.tick++; return }
  s.tick++; s.events = []
  const c = s.crew
  if (s.phase === 'countdown') {
    if (--s.countdownTicks <= 0) { s.phase = 'playing'; s.events.push({ type: 'tripStart' }) }
    return
  }
  c.repairShockTicks=Math.max(0,c.repairShockTicks-1)
  const elapsed = s.tick - 180, world = expeditionWorld(s)
  const lift=ALTITUDE_EVENTS[c.altitudeEventIndex]
  if(lift&&elapsed>=lift.at){
    c.altitudeEventIndex++
    if(elapsed<lift.at+lift.duration){s.boat.flight={kind:lift.kind,tick:elapsed-lift.at,duration:lift.duration,peak:lift.peak};say(s,lift.kind==='boss-wave'?'GUARDIAN UPDRAFT · KEEP FIRING!':lift.kind==='jetstream'?'JETSTREAM · TAKE TO THE SKY!':'UPDRAFT · A LITTLE AIRTIME!')}
  }
  const wasAirborne=Boolean(s.boat.flight);advanceAltitude(s.boat)
  if(wasAirborne&&!s.boat.flight)say(s,'BACK AT SEA LEVEL')
  const warning=bossWarning(s)
  if(warning?.ticks===180)say(s,warning.name+' APPROACHING · LOOK UP!')
  for (const key of ['shieldTicks', 'shieldCooldown', 'boostCooldown', 'shotCooldown'] as const) c[key] = Math.max(0, c[key] - 1)
  s.invulnerableTicks = Math.max(0, s.invulnerableTicks - 1)
  s.rushTicks = Math.max(0, s.rushTicks - 1); s.flareTicks = Math.max(0, s.flareTicks - 1)
  c.explosions = c.explosions.filter(e => --e.ticks > 0)
  c.heat = 0; c.overheated = false; c.choiceTicks = 0; c.swap = null
  let steer = 0
  const gunners:string[]=[]
  // Stable player order makes simultaneous repairs and taps identical on both peers.
  for (const p of Object.values(s.players).sort((a, b) => a.side.localeCompare(b.side))) {
    const input = inputs[p.id]
    const counts = c.actions[p.id] ??= { left: 0, right: 0, shoot: 0, recover: 0 }
    // Legacy taps are destination requests, never instant work or multi-tasking.
    const destination=input?.station??(input?.recoverTap?'recover':input?.shootTap?'shoot':input?.rightTap?'right':input?.leftTap?'left':undefined)
    if(destination&&assignStation(p,destination))counts[destination]++
    advanceCrewMember(p)
    const station=operatingStation(p)
    if(station==='left')steer--
    if(station==='right')steer++
    if(station==='shoot')gunners.push(p.id)
    if (input?.targetId !== undefined) c.targetId = input.targetId
    if (station==='recover' && s.hearts < 3 && !c.repairShockTicks) {
      c.repair+=c.scrap>=RECOVERY_SCRAP?1.5:1
      if (c.repair >= RECOVERY_WORK) {
        c.scrap = Math.max(0,c.scrap-RECOVERY_SCRAP); s.hearts++; c.repair = 0
        s.events.push({ type: 'healed', x: s.boat.x, y: .76 }); say(s, 'RECOVERED +1 HEART')
      }
    }
  }
  if (s.hearts >= 3) c.repair = 0
  c.pendingShots=[]
  s.boat.heading = clamp(s.boat.heading*.9 + clamp(steer,-1,1)*.0008,-.008,.008)
  s.boat.x = wrapOrbit(s.boat.x + s.boat.heading)
  if (Math.abs(s.boat.heading) < .00001) s.boat.heading = 0
  s.paddles.left = steer < 0 ? 1 : s.paddles.left * .8
  s.paddles.right = steer > 0 ? 1 : s.paddles.right * .8
  s.boat.speed += (.0028 - s.boat.speed) * .1
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
  if (elapsed % 420 === 0) spawn(s, world === 2 ? 'log' : 'rock')
  if (elapsed >= 300 && elapsed % (world >= 3 ? 420 : 480) === 0) {
    const wave = Math.floor(elapsed / 420)
    enemy(s, wave % 2 ? 'ambusher' : 'chaser', wave%2?-.38:.38)
  }
  if (elapsed % 360 === 0) spawn(s, 'rescue', s.boat.x+(random(s)-.5)*.65)
  if (elapsed % 260 === 0) spawn(s, 'relic')
  if (elapsed % 660 === 0) spawn(s, 'gate')
  const encounter=BOSS_ENCOUNTERS[c.encounterIndex]
  if(encounter&&elapsed>=encounter.at){
    const boss=enemy(s,'boss')!
    boss.bossKind=encounter.kind;boss.family=encounter.kind==='sentinel'?'jelly':'wyrm';boss.recipe=s.voyage.monsters.findIndex(r=>r.family===boss.family);boss.hp=boss.maxHp=encounter.hp
    boss.flight={kind:'drop',tick:0,duration:150,peak:encounter.kind==='guardian'?9:7};boss.altitude=boss.flight.peak
    c.encounterIndex++;if(encounter.kind==='guardian')c.bossSpawned=true
    say(s,encounter.name+' · UNLEASH YOUR CANNONS!')
  }

  for (const o of s.objects) {
    o.phase += .05
    advanceAltitude(o)
    if (o.type !== 'predator') { o.y += s.boat.speed; if (o.type === 'log') o.x = wrapOrbit(o.x+Math.sin(o.phase)*.0015); continue }
    o.age = (o.age ?? 0) + 1; o.hp ??= 4; o.maxHp ??= o.hp; o.enemy ??= 'ambusher'
    o.slowTicks = Math.max(0, (o.slowTicks ?? 0) - 1)
    const slow = o.slowTicks ? .5 : 1, age = o.age
    o.attackPhase??='stalk';o.attackTick=(o.attackTick??0)+1
    const recipe=s.voyage.monsters[o.recipe??-1],profile=BEAST_TRAITS[recipe?.trait??'ambush']
    const dx=orbitDelta(s.boat.x,o.x),dy=.76-o.y,d=Math.max(.001,Math.hypot(dx,dy))
    if(o.attackPhase==='stalk'){
      // Pursuit is persistent across the cylinder seam; monsters never scroll away.
      const speed=profile.speed*slow
      o.x=wrapOrbit(o.x+dx/d*speed);o.y+=dy/d*speed
      if(d<.46&&o.attackTick>120){o.attackPhase='telegraph';o.attackTick=0;o.targetX=s.boat.x;o.targetY=.76}
    }else if(o.attackPhase==='telegraph'){
      // A locked landing marker leaves time to run to a helm and evade.
      if(o.attackTick>=profile.windup){o.attackPhase='strike';o.attackTick=0
        if(recipe?.trait==='tempest'){const rock=spawn(s,'rock',o.targetX,o.targetY);rock.radius=.055;rock.altitude=6;rock.flight={kind:'drop',tick:0,duration:130,peak:6}}
      }
    }else if(o.attackPhase==='strike'){
      const tx=orbitDelta(o.targetX??s.boat.x,o.x),ty=(o.targetY??.76)-o.y,td=Math.max(.001,Math.hypot(tx,ty)),step=Math.min(td,profile.strike*slow)
      o.x=wrapOrbit(o.x+tx/td*step);o.y+=ty/td*step
      if(o.attackTick>=42||td<.025){o.attackPhase='recover';o.attackTick=0}
    }else{
      o.y+=Math.sin(o.phase)*.0005
      if(o.attackTick>=profile.recovery){o.attackPhase='stalk';o.attackTick=0}
    }
    if(o.enemy==='boss'&&age%480===240){const rock=spawn(s,'rock',s.boat.x,.76);rock.radius=.07;rock.flight={kind:'drop',tick:0,duration:150,peak:8};rock.altitude=8}
  }

  const flying: CrewShot[] = []
  for (const shot of c.shots) {
    const target = s.objects.find(o => o.id === shot.targetId && (o.hp ?? 0) > 0)
    if (target) {
      shot.toX = target.x; shot.toY = target.y;shot.toAltitude=objectAltitude(target)+.45
      const dx=orbitDelta(target.x,shot.x),dz=(shot.toAltitude-shot.altitude)/ALTITUDE_SCALE,d = Math.max(.001, Math.hypot(dx, target.y-shot.y,dz))
      shot.vx += (dx / d * .016 - shot.vx) * .2
      shot.vy += ((target.y - shot.y) / d * .016 - shot.vy) * .2
      shot.vAltitude+=(dz/d*.016*ALTITUDE_SCALE-shot.vAltitude)*.2
    }
    shot.x = wrapOrbit(shot.x+shot.vx); shot.y += shot.vy;shot.altitude=Math.max(0,shot.altitude+shot.vAltitude);shot.ticks--
    const impact = s.objects.some(o => o.type === 'predator' && (o.hp ?? 1) > 0 && combatDistance(o.x,o.y,objectAltitude(o)+.45,shot.x,shot.y,shot.altitude) < o.radius + .025)
    if (impact || shot.ticks <= 0 || shot.y < -.16 || shot.y > 1.2 || shot.altitude===0) explode(s, shot)
    else flying.push(shot)
  }
  c.shots = flying
  if (!c.shotCooldown && gunners.length && c.shots.length < MAX_SHOTS - 1) {
    const owner = gunners[Math.floor(elapsed/42)%gunners.length]!, enemies = targets(s)
    launch(s, owner, enemies[0],false)
    if (c.upgrades.includes('twin')) launch(s, owner, enemies[1] ?? enemies[0],false,true)
    c.shotCooldown = gunners.length>1?30:42
  }

  const survivors: RiverObject[] = []
  for (const o of s.objects) {
    if (o.type === 'predator' && (o.hp ?? 1) <= 0) {
      const boss=o.enemy==='boss'?BOSS_ENCOUNTERS.find(b=>b.kind===(o.bossKind??'guardian')):undefined
      const reward=boss?.reward??90;c.kills++;c.scrap+=boss?.salvage??1;s.score+=reward
      if (boss) {c.bossesDefeated++;if(boss.kind==='guardian')c.bossDefeated=true;say(s,boss.name+' DOWN · +'+reward+' SCORE · +'+boss.salvage+' SALVAGE')}
      s.events.push({ type: 'smashed', value: reward, x: o.x, y: o.y }); continue
    }
    const hazard = o.type === 'rock' || o.type === 'log' || o.type === 'predator'
    if (!hazard && c.upgrades.includes('magnet') && Math.abs(o.y - .76) < .28 && Math.abs(orbitDelta(o.x,s.boat.x))<.6) o.x = wrapOrbit(o.x+orbitDelta(s.boat.x,o.x)*.12)
    const collided = combatDistance(o.x,o.y,objectAltitude(o),s.boat.x,.76,s.boat.altitude) < o.radius + .105
    if (collided && (o.type!=='predator'||o.attackPhase==='strike')) {
      if (hazard) {
        if (c.shieldTicks || c.bubble) { if (!c.shieldTicks) c.bubble--; say(s, 'BUBBLE BLOCKED THE HIT'); s.score += 25 }
        else if (!s.invulnerableTicks) { s.hearts--; s.streak = 0; s.invulnerableTicks = 90; c.repair=Math.floor(c.repair*.5); c.repairShockTicks=90; say(s,'HULL SHOCK · EVADE TO REPAIR'); s.events.push({ type: 'crash', x: o.x, y: o.y }) }
      } else if (o.type === 'rescue') { s.rescued++; s.score += 120; s.events.push({ type: 'rescued', x: o.x, y: o.y }) }
      else if (o.type === 'relic') { s.relics++; c.scrap += 2; s.score += 50; s.events.push({ type: 'relic', x: o.x, y: o.y }) }
      else if (o.type === 'heart') { s.hearts = Math.min(3, s.hearts + 1); s.events.push({ type: 'healed', x: o.x, y: o.y }) }
      else if (o.type === 'gate') { s.gates++; s.score += 100; say(s, 'GATE CLEARED +100') }
      else { s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); s.score += 10 + Math.min(s.streak, 30) }
      if(o.type==='predator'){o.attackPhase='recover';o.attackTick=0;survivors.push(o)}
      continue
    }
    if (o.type==='predator'||o.y > -.3 && o.y < 1.3) survivors.push(o)
  }
  s.objects = survivors.slice(-MAX_OBJECTS); c.scrap = Math.min(30, c.scrap)
  c.victory = c.bossDefeated && s.rescued >= 3 && s.hearts > 0
  if (c.victory || s.hearts <= 0 || elapsed >= s.durationTicks) {
    s.phase = 'finished'; c.finishedTick = s.tick; s.hearts = Math.max(0, s.hearts)
    s.boat.flight=null;s.boat.altitude=0
    s.events.push({ type: 'tripFinished', score: s.score, distance: s.distance })
  }
}
