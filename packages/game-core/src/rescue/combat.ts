import { HULL_RADIUS, angleDistance, clampRescue, rescueAngle, rescueEvent, rescueRandom, type EnemyKind, type RescueBullet, type RescueEnemy, type RescueState } from './types'
import { segmentCircle } from './world'

export function damageRescueVessel(s: RescueState, id: number, amount: number) {
  const vessel = s.vessels.find(v => v.id === id)
  if (!vessel || vessel.disabled) return
  vessel.ship.hp = Math.max(0, vessel.ship.hp - amount / 12)
  rescueEvent(s, 'hit', vessel.ship.x, vessel.ship.y, 0, .6, amount)
  if (vessel.ship.hp <= 0) { vessel.disabled = true; vessel.ship.vx = 0; vessel.ship.vy = 0; if (vessel.role === 'raider') { s.campaign.salvage += 20; s.stats.kills++ }; rescueEvent(s, 'boom', vessel.ship.x, vessel.ship.y, 0, 3) }
}

export const RESCUE_ENEMY_STATS: Record<EnemyKind, { hp: number; radius: number }> = {
  moth: { hp: 42, radius: 1 }, beetle: { hp: 90, radius: 1.35 }, jelly: { hp: 68, radius: 1.25 },
  needle: { hp: 34, radius: .85 }, sentinel: { hp: 135, radius: 1.5 }, guardian: { hp: 620, radius: 3.25 },
}
export const RESCUE_MAX_ENEMIES = 12, RESCUE_MAX_BULLETS = 160
export function rescueEnemyRecipe(s: RescueState, kind: EnemyKind) {
  const family = kind === 'moth' ? 'manta' : kind === 'beetle' || kind === 'sentinel' ? 'crab' : kind === 'needle' ? 'wyrm' : 'jelly'
  return s.voyage?.monsters.find(recipe => recipe.family === family) ?? null
}
export function spawnRescueEnemy(s: RescueState, kind: EnemyKind, x: number, y: number) {
  if (s.enemies.length >= RESCUE_MAX_ENEMIES) return null
  const recipe = rescueEnemyRecipe(s, kind), base = RESCUE_ENEMY_STATS[kind]
  const stats = { hp: base.hp * (recipe?.trait === 'bulwark' ? 1.2 : recipe?.trait === 'skirmisher' ? .9 : 1), radius: base.radius * (recipe?.scale ?? 1) }
  const enemy: RescueEnemy = { id: s.nextId++, kind, x, y, hp: stats.hp, maxHp: stats.hp, radius: stats.radius, angle: 0,
    vx: 0, vy: 0, age: 0, phase: 'stalk', phaseTime: 0, targetX: s.ship.x, targetY: s.ship.y, cooldown: 1.5 + rescueRandom(s), variant: Math.floor(rescueRandom(s) * 4) }
  s.enemies.push(enemy)
  return enemy
}
export function spawnRescueBullet(s: RescueState, x: number, y: number, angle: number, speed: number, damage: number, enemy: boolean, owner: string | null = null, kind: RescueBullet['kind'] = 'bolt', pierce = 0) {
  if (s.bullets.length >= RESCUE_MAX_BULLETS) return
  s.bullets.push({ id: s.nextId++, x, y, vx: Math.cos(angle) * speed + (enemy ? 0 : s.ship.vx), vy: Math.sin(angle) * speed + (enemy ? 0 : s.ship.vy),
    radius: enemy ? kind === 'orb' ? .32 : .14 : .13, damage, life: enemy ? 9 : 2.1, owner, enemy, kind, pierce, hit: [] })
}
export function shieldCovers(s: RescueState, angle: number): boolean {
  const shield = s.stations.find(v => v.id === 'shield')!
  return (shield.operated || shield.lingering > 0) && angleDistance(angle, shield.angle) < (shield.upgrade === 'power' ? Math.PI / 3 : Math.PI / 4)
}
export function damageRescueShip(s: RescueState, amount: number, x: number, y: number) {
  if (s.ship.invulnerable > 0 || s.phase !== 'playing') return
  const engine = s.stations.find(v => v.id === 'engine')!
  const damage = engine.upgrade === 'metal' ? Math.max(1, amount - 1) : amount
  s.ship.hp = Math.max(0, s.ship.hp - damage); s.ship.invulnerable = 1; s.ship.hitAngle = Math.atan2(y - s.ship.y, x - s.ship.x)
  s.stats.damage += damage; rescueEvent(s, 'hit', s.ship.x, s.ship.y, s.ship.hitAngle, 1, damage)
  if (!s.ship.hp) { s.phase = 'lost'; rescueEvent(s, 'lose') }
}
export function damageRescueEnemy(s: RescueState, e: RescueEnemy, amount: number, x: number, y: number, piercing = false) {
  if (e.hp <= 0) return
  const armored = e.kind === 'sentinel' && !piercing && angleDistance(Math.atan2(y - e.y, x - e.x), e.angle) < Math.PI / 3
  e.hp -= amount * (armored ? .2 : 1)
  rescueEvent(s, armored ? 'shield' : 'hit', e.x, e.y, Math.atan2(e.y - y, e.x - x), .45, amount)
  if (e.hp <= 0) {
    s.campaign.salvage += e.kind === 'guardian' ? 25 : 3
    s.stats.kills++; rescueEvent(s, 'boom', e.x, e.y, 0, e.kind === 'guardian' ? 4 : e.radius, 0)
    if (e.kind === 'guardian') { s.guardianDefeated = true; s.ship.hp = Math.min(s.ship.maxHp, s.ship.hp + 2) }
  }
}
export function openRescueGift(s: RescueState, id: number) {
  const gift = s.world.gifts.find(g => g.id === id)
  if (!gift || gift.opened) return
  gift.opened = true
  s.gems.push({ id: s.nextId++, kind: gift.kind, x: 0, y: -.3, vx: (rescueRandom(s) - .5) * 1.5, vy: 1, heldBy: null, socket: null, thrown: false })
  rescueEvent(s, 'gem', s.ship.x, s.ship.y, 0, 1, 0, undefined, gift.kind)
}
export function damageRescueCage(s: RescueState, id: number, damage: number) {
  const cage = s.world.cages.find(c => c.id === id)
  if (!cage || cage.open) return
  cage.hp = Math.max(0, cage.hp - damage)
  if (!cage.hp) { cage.open = true; rescueEvent(s, 'cage', cage.x, cage.y, 0, 1, cage.pet) }
}

export function advanceRescueEnemies(s: RescueState, dt: number) {
  for (const e of s.enemies) {
    e.age += dt; e.phaseTime += dt; e.cooldown -= dt
    const dx = s.ship.x - e.x, dy = s.ship.y - e.y, distance = Math.max(.01, Math.hypot(dx, dy)), angle = Math.atan2(dy, dx)
    if (e.kind === 'beetle') {
      if (e.phase === 'stalk') {
        e.angle = angle; e.x += dx / distance * Math.max(0, distance - 12) * .6 * dt; e.y += dy / distance * Math.max(0, distance - 12) * .6 * dt
        if (distance < 17 && e.cooldown <= 0) { e.phase = 'tell'; e.phaseTime = 0; e.targetX = s.ship.x; e.targetY = s.ship.y }
      } else if (e.phase === 'tell') {
        if (e.phaseTime < 1) { e.targetX = s.ship.x; e.targetY = s.ship.y; e.angle = angle }
        if (e.phaseTime > 1.6) { e.phase = 'attack'; e.phaseTime = 0; e.vx = Math.cos(e.angle) * 17; e.vy = Math.sin(e.angle) * 17 }
      } else if (e.phase === 'attack') {
        e.x += e.vx * dt; e.y += e.vy * dt
        if (e.phaseTime > 1.2) { e.phase = 'recover'; e.phaseTime = 0 }
      } else if (e.phaseTime > 2.5) { e.phase = 'stalk'; e.cooldown = 1 }
    } else {
      e.angle = angle
      const desired = e.kind === 'guardian' ? 12.5 : e.kind === 'needle' ? 9.5 : e.kind === 'jelly' ? 10 : 9
      const radial = clampRescue((distance - desired) * .6, -1.2, e.kind === 'guardian' ? 3 : 2.6)
      const orbit = e.kind === 'needle' ? 2.5 : e.kind === 'moth' ? 1 : .3
      if (e.phase !== 'tell') { e.x += (dx / distance * radial - dy / distance * orbit) * dt; e.y += (dy / distance * radial + dx / distance * orbit) * dt }
      if (e.phase === 'stalk' && e.cooldown <= 0 && distance < 24) { e.phase = 'tell'; e.phaseTime = 0 }
      if (e.phase === 'tell' && e.phaseTime > (e.kind === 'guardian' ? 2 : 1.35)) {
        const count = e.kind === 'guardian' ? e.hp < e.maxHp / 2 ? 11 : 7 : e.kind === 'moth' ? 3 : e.kind === 'needle' ? 3 : 1
        const spread = e.kind === 'guardian' ? .18 : .17
        for (let i = 0; i < count; i++) spawnRescueBullet(s, e.x + Math.cos(angle) * e.radius, e.y + Math.sin(angle) * e.radius,
          angle + (i - (count - 1) / 2) * spread, e.kind === 'needle' ? 6.5 : e.kind === 'jelly' ? 3.4 : 5, e.kind === 'guardian' || e.kind === 'jelly' ? 2 : 1, true, null, e.kind === 'jelly' ? 'orb' : 'needle')
        rescueEvent(s, 'shot', e.x, e.y, angle, .7, 1)
        e.phase = 'recover'; e.phaseTime = 0
      } else if (e.phase === 'recover' && e.phaseTime > .7) { e.phase = 'stalk'; e.cooldown = e.kind === 'guardian' ? 2 : 2.4 + rescueRandom(s) * 1.2 }
    }
    e.x = clampRescue(e.x, -s.world.width / 2 + 2, s.world.width / 2 - 2); e.y = clampRescue(e.y, -s.world.height / 2 + 2, s.world.height / 2 - 2)
    const hx = e.x - s.ship.x, hy = e.y - s.ship.y, hd = Math.max(.01, Math.hypot(hx, hy)), contact = HULL_RADIUS + e.radius
    if (hd < contact) {
      const hitAngle = Math.atan2(hy, hx)
      if (shieldCovers(s, hitAngle)) { if (e.phase === 'attack') { s.stats.blocks++; rescueEvent(s, 'shield', s.ship.x + Math.cos(hitAngle) * 5, s.ship.y + Math.sin(hitAngle) * 5, hitAngle, 1) }; e.phase = 'recover'; e.phaseTime = 0 }
      else damageRescueShip(s, e.kind === 'beetle' || e.kind === 'guardian' ? 2 : 1, e.x, e.y)
      e.x = s.ship.x + hx / hd * (contact + .15); e.y = s.ship.y + hy / hd * (contact + .15)
      e.vx *= -.3; e.vy *= -.3
    }
  }
  s.enemies = s.enemies.filter(e => e.hp > 0 && (e.kind === 'guardian' || Math.hypot(e.x - s.ship.x, e.y - s.ship.y) < 60))
}

export function advanceRescueBullets(s: RescueState, dt: number) {
  for (const b of s.bullets) {
    b.life -= dt
    const ax = b.x, ay = b.y, bx = ax + b.vx * dt, by = ay + b.vy * dt
    let barrier = 2
    for (const o of s.world.obstacles) { const t = segmentCircle(ax, ay, bx, by, o.x, o.y, o.radius + b.radius); if (t !== null) barrier = Math.min(barrier, t) }
    if (b.enemy) {
      const shieldT = segmentCircle(ax, ay, bx, by, s.ship.x, s.ship.y, HULL_RADIUS + .65)
      const angle = shieldT === null ? 0 : Math.atan2(ay + (by - ay) * shieldT - s.ship.y, ax + (bx - ax) * shieldT - s.ship.x)
      if (shieldT !== null && shieldT <= barrier && shieldCovers(s, angle) && Math.hypot(ax - s.ship.x, ay - s.ship.y) > HULL_RADIUS + .3) {
        s.stats.blocks++; s.ship.shieldHits++; rescueEvent(s, 'shield', ax + (bx - ax) * shieldT, ay + (by - ay) * shieldT, angle, .7)
        const shield = s.stations.find(v => v.id === 'shield')!
        if (shield.upgrade === 'beam') {
          const nx = Math.cos(angle), ny = Math.sin(angle), dot = b.vx * nx + b.vy * ny
          b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; b.enemy = false; b.damage = 28; b.owner = s.crew.find(c => c.seat === 'shield')?.id ?? null
          b.x = s.ship.x + nx * (HULL_RADIUS + .8); b.y = s.ship.y + ny * (HULL_RADIUS + .8); b.life = 4
          continue
        }
        b.life = 0
      } else {
        const hit = segmentCircle(ax, ay, bx, by, s.ship.x, s.ship.y, HULL_RADIUS + b.radius)
        if (hit !== null && hit <= barrier) { damageRescueShip(s, b.damage, ax, ay); b.life = 0 }
      }
    } else {
      const hits: Array<{ t: number; id: number; kind: 'enemy' | 'cage' | 'gift' | 'vessel' }> = []
      for (const v of s.vessels) if (v.role === 'raider' && !v.disabled && !b.hit.includes(v.id)) { const t = segmentCircle(ax, ay, bx, by, v.ship.x, v.ship.y, HULL_RADIUS); if (t !== null) hits.push({ t, id: v.id, kind: 'vessel' }) }
      for (const e of s.enemies) { if (e.hp <= 0 || b.hit.includes(e.id)) continue; const t = segmentCircle(ax, ay, bx, by, e.x, e.y, e.radius + b.radius); if (t !== null) hits.push({ t, id: e.id, kind: 'enemy' }) }
      for (const c of s.world.cages) { if (c.open || b.hit.includes(c.id)) continue; const t = segmentCircle(ax, ay, bx, by, c.x, c.y, 1.2 + b.radius); if (t !== null) hits.push({ t, id: c.id, kind: 'cage' }) }
      for (const g of s.world.gifts) { if (g.opened || b.hit.includes(g.id)) continue; const t = segmentCircle(ax, ay, bx, by, g.x, g.y, .8 + b.radius); if (t !== null) hits.push({ t, id: g.id, kind: 'gift' }) }
      for (const hit of hits.sort((a, c) => a.t - c.t || a.id - c.id)) {
        if (hit.t > barrier) break
        if (hit.kind === 'enemy') damageRescueEnemy(s, s.enemies.find(e => e.id === hit.id)!, b.damage, ax, ay, b.pierce > 0)
        else if (hit.kind === 'cage') damageRescueCage(s, hit.id, b.damage)
        else if (hit.kind === 'vessel') damageRescueVessel(s, hit.id, b.damage)
        else openRescueGift(s, hit.id)
        b.hit.push(hit.id)
        if (b.pierce-- <= 0) { b.life = 0; break }
      }
    }
    if (barrier <= 1) { b.life = 0; rescueEvent(s, 'hit', ax + (bx - ax) * barrier, ay + (by - ay) * barrier, rescueAngle(Math.atan2(b.vy, b.vx)), .2) }
    b.x = bx; b.y = by
  }
  s.bullets = s.bullets.filter(b => b.life > 0)
}

export function rescueBeam(s: RescueState, x: number, y: number, angle: number, damage: number, range: number, actor: string, nova = false) {
  let length = range
  if (!nova) for (const o of s.world.obstacles) { const hit = segmentCircle(x, y, x + Math.cos(angle) * range, y + Math.sin(angle) * range, o.x, o.y, o.radius); if (hit !== null) length = Math.min(length, hit * range) }
  const ex = x + Math.cos(angle) * length, ey = y + Math.sin(angle) * length
  for (const enemy of s.enemies) if (segmentCircle(x, y, ex, ey, enemy.x, enemy.y, enemy.radius + (nova ? .9 : .12)) !== null) damageRescueEnemy(s, enemy, damage * (nova && enemy.kind === 'guardian' ? .65 : 1), x, y, true)
  for (const vessel of s.vessels) if (vessel.role === 'raider' && !vessel.disabled && segmentCircle(x, y, ex, ey, vessel.ship.x, vessel.ship.y, HULL_RADIUS) !== null) damageRescueVessel(s, vessel.id, damage)
  for (const cage of s.world.cages) if (!cage.open && segmentCircle(x, y, ex, ey, cage.x, cage.y, 1.2) !== null) damageRescueCage(s, cage.id, damage)
  for (const gift of s.world.gifts) if (!gift.opened && segmentCircle(x, y, ex, ey, gift.x, gift.y, .8) !== null) openRescueGift(s, gift.id)
  rescueEvent(s, nova ? 'starburst' : 'beam', x, y, angle, length, damage, actor)
}
