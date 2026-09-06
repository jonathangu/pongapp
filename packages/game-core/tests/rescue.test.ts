import { describe, expect, it } from 'vitest'
import { HULL_RADIUS, RESCUE_BUTTON, RESCUE_NAV, RESCUE_STATIONS, advanceRescueBullets, advanceRescueCrew, advanceRescueGame, advanceRescueShip,
  createRescueCrew, createRescueGame, createRescueWorld, damageRescueCage, damageRescueEnemy, neutralRescueInput, openRescueGift,
  rescueMapReachable, rescuePath, restartRescueGame, routeRescueCrew, segmentCircle, spawnRescueBullet, spawnRescueEnemy, stationSpec, validRescueInput,
  type RescueInput, type StationId } from '../src/rescue/index'

const tick = (s: ReturnType<typeof createRescueGame>, input: Partial<RescueInput> = {}, frames = 1) => {
  for (let i = 0; i < frames; i++) advanceRescueGame(s, { captain: { ...neutralRescueInput(s.tick + 1), ...input } })
}
const seat = (s: ReturnType<typeof createRescueGame>, id: StationId) => { const p = s.crew[0]!, spec = stationSpec(id); p.x = spec.x; p.y = spec.y; p.grounded = true; p.seat = id; return p }

describe('Starling ship-local movement', () => {
  it('keeps crew local trajectory exactly independent of hull translation, acceleration and impacts', () => {
    const stationary = createRescueGame({ solo: false }), moving = createRescueGame({ solo: false })
    moving.world.obstacles = [{ id: 50, x: 18, y: -24, radius: 3, style: 0 }]
    for (let frame = 0; frame < 360; frame++) {
      const input = { ...neutralRescueInput(frame), x: frame < 90 ? 1 : -.5, buttons: frame % 90 < 14 ? RESCUE_BUTTON.jump : 0 }
      moving.ship.vx = frame < 180 ? 11 : -11; moving.ship.vy = Math.sin(frame / 20) * 6
      advanceRescueGame(stationary, { captain: input }); advanceRescueGame(moving, { captain: input })
      const a = stationary.crew[0]!, b = moving.crew[0]!
      expect([b.x, b.y, b.vx, b.vy, b.grounded]).toEqual([a.x, a.y, a.vx, a.vy, a.grounded])
      expect(moving.ship.angle).toBe(0); expect(moving.ship.angularVelocity).toBe(0)
    }
  })
  it('runs, buffered-jumps, falls and lands on a real platform', () => {
    const p = createRescueCrew('a', 'A', false); const start = p.x
    for (let n = 0; n < 20; n++) { const input = { ...neutralRescueInput(n), x: 1 }; advanceRescueCrew(p, input, 1 / 60); p.lastButtons = 0 }
    expect(p.x).toBeGreaterThan(start + 1)
    let highest = p.y
    for (let n = 0; n < 100; n++) { const input = { ...neutralRescueInput(n), buttons: n < 15 ? RESCUE_BUTTON.jump : 0 }; advanceRescueCrew(p, input, 1 / 60); p.lastButtons = input.buttons; highest = Math.max(highest, p.y) }
    expect(highest).toBeGreaterThan(-.2); expect(p.y).toBe(-1.3); expect(p.grounded).toBe(true)
  })
  it('climbs a ladder without receiving world velocity', () => {
    const p = createRescueCrew('a', 'A', false); p.x = 2.15
    for (let n = 0; n < 45; n++) advanceRescueCrew(p, { ...neutralRescueInput(n), y: 1 }, 1 / 60)
    expect(p.y).toBeCloseTo(.8); expect(p.x).toBe(2.15); expect(p.vy).toBe(0)
  })
  it('drop-through does not get recaptured by the same platform', () => {
    const p = createRescueCrew('a', 'A', false); p.y = .8; p.x = -1
    for (let n = 0; n < 70; n++) { const input = { ...neutralRescueInput(n), y: n === 0 ? -1 : 0, buttons: n === 0 ? RESCUE_BUTTON.jump : 0 }; advanceRescueCrew(p, input, 1 / 60); p.lastButtons = input.buttons }
    expect(p.y).toBe(-1.3); expect(p.grounded).toBe(true)
  })
  it('has controller-validated jump edges and a connected A* route for all eight seats', () => {
    expect(RESCUE_NAV.edges.flat().some(e => e.kind === 'jump')).toBe(true)
    for (const a of RESCUE_STATIONS) for (const b of RESCUE_STATIONS) expect(rescuePath(a, b.id).length, `${a.id}->${b.id}`).toBeGreaterThan(0)
  })
  it('physically executes every seat-to-seat route without teleporting', () => {
    for (const a of RESCUE_STATIONS) for (const b of RESCUE_STATIONS) {
      const s = createRescueGame({ solo: false }); s.nextWave = 999; const p = seat(s, a.id)
      for (let frame = 0; frame < 900 && p.seat !== b.id; frame++) {
        const old = { x: p.x, y: p.y }, input = routeRescueCrew(p, b.id, s.tick + 1, 1 / 60)
        advanceRescueGame(s, { captain: input })
        expect(Math.hypot(old.x - p.x, old.y - p.y), `${a.id}->${b.id} teleport`).toBeLessThan(.8)
      }
      expect(p.seat, `${a.id}->${b.id} stuck at ${p.x.toFixed(2)},${p.y.toFixed(2)} route${p.routeAt}/${p.route.length}`).toBe(b.id)
    }
  })
})

describe('Starling stations, physics and combat', () => {
  it('rejects malformed and nonfinite controls', () => {
    expect(validRescueInput(neutralRescueInput())).toBe(true)
    for (const input of [{ ...neutralRescueInput(), x: NaN }, { ...neutralRescueInput(), x: 2 }, { ...neutralRescueInput(), buttons: 99 }, { ...neutralRescueInput(), command: 'hack' }, { ...neutralRescueInput(), seq: -1 }]) expect(validRescueInput(input)).toBe(false)
  })
  it('seats are exclusive, require arrival, and jump exits', () => {
    const s = createRescueGame({ solo: false }), a = s.crew[0]!, b = s.crew[1]!, spec = stationSpec('east')
    tick(s, { buttons: RESCUE_BUTTON.interact }); expect(a.seat).toBeNull()
    a.x = b.x = spec.x; a.y = b.y = spec.y; a.lastButtons = 0
    const input = { ...neutralRescueInput(3), buttons: RESCUE_BUTTON.interact }
    advanceRescueGame(s, { captain: input, pip: input })
    expect(a.seat).toBe('east'); expect(b.seat).toBeNull()
    tick(s, { buttons: RESCUE_BUTTON.jump }); expect(a.seat).toBeNull()
  })
  it('engine thrust is opposite the nozzle and never rotates the hull', () => {
    const s = createRescueGame({ solo: false }); seat(s, 'engine')
    tick(s, { buttons: RESCUE_BUTTON.fire, aimX: 0, aimY: -1 }, 120)
    expect(s.ship.y).toBeGreaterThan(-12); expect(Math.abs(s.ship.x)).toBeLessThan(.001); expect(s.ship.angle).toBe(0)
  })
  it('coasts with drag and sweeps against inflated obstacles', () => {
    const s = createRescueGame(); s.world.obstacles = [{ id: 1, x: 10, y: -24, radius: 2, style: 0 }]; s.ship.vx = 10000
    for (let i = 0; i < 120; i++) advanceRescueShip(s, 1 / 60)
    expect(s.ship.x).toBeLessThanOrEqual(10 - 2 - HULL_RADIUS + .01); expect(Math.abs(s.ship.vx)).toBeLessThan(1)
  })
  it('limits turret aim and does not fire an unoccupied station', () => {
    const s = createRescueGame({ solo: false }); tick(s, { buttons: RESCUE_BUTTON.fire }, 10); expect(s.stats.shots).toBe(0)
    seat(s, 'east'); tick(s, { buttons: RESCUE_BUTTON.fire, aimX: -1 }, 120)
    expect(Math.abs(s.stations.find(v => v.id === 'east')!.angle)).toBeLessThanOrEqual(Math.PI / 3 + .001)
    expect(s.stats.shots).toBeGreaterThan(0)
  })
  it('blocks a swept shot across the angle wrap and leaves the opposite hull vulnerable', () => {
    const s = createRescueGame({ solo: false }), sh = s.stations.find(v => v.id === 'shield')!; sh.operated = true; sh.angle = Math.PI - .01
    spawnRescueBullet(s, -7, -24, 0, 20, 1, true); advanceRescueBullets(s, .3)
    expect(s.stats.blocks).toBe(1); expect(s.ship.hp).toBe(12)
    spawnRescueBullet(s, 7, -24, Math.PI, 20, 1, true); advanceRescueBullets(s, .3)
    expect(s.ship.hp).toBe(11)
  })
  it('beam shield reflects instead of duplicating a bullet', () => {
    const s = createRescueGame(), sh = s.stations.find(v => v.id === 'shield')!; sh.operated = true; sh.angle = 0; sh.upgrade = 'beam'
    spawnRescueBullet(s, 7, -24, Math.PI, 10, 1, true); advanceRescueBullets(s, .3)
    expect(s.bullets).toHaveLength(1); expect(s.bullets[0]!.enemy).toBe(false); expect(s.bullets[0]!.vx).toBeGreaterThan(0)
  })
  it('charges then releases Starburst, with a real cooldown', () => {
    const s = createRescueGame({ solo: false }); seat(s, 'starburst'); tick(s, { buttons: RESCUE_BUTTON.fire }, 155)
    const station = s.stations.find(v => v.id === 'starburst')!; expect(station.charge).toBe(1)
    tick(s); expect(station.charge).toBe(0); expect(station.cooldown).toBe(14); expect(s.events.some(e => e.kind === 'starburst')).toBe(true)
  })
  it('solo slow time affects both contexts, but never slows co-op', () => {
    const solo = createRescueGame(), online = createRescueGame({ solo: false })
    tick(solo, { buttons: RESCUE_BUTTON.command }, 60); tick(online, { buttons: RESCUE_BUTTON.command }, 60)
    expect(solo.time).toBeCloseTo(.16); expect(online.time).toBeCloseTo(1)
  })
  it('has robust swept circle collision for fast projectiles', () => {
    expect(segmentCircle(-100, 0, 100, 0, 0, 0, 1)).toBeCloseTo(.495)
    expect(segmentCircle(-100, 2, 100, 2, 0, 0, 1)).toBeNull()
  })
  it('metal flail uses bounded angular inertia and damages at its physical tip', () => {
    const s = createRescueGame({ solo: false }); seat(s, 'east'); s.nextWave = 999
    const station = s.stations.find(st => st.id === 'east')!; station.upgrade = 'metal'; station.flailAngle = -Math.PI / 2
    let previous = station.flailAngle, movement = 0
    for (let i = 0; i < 180; i++) {
      tick(s, { buttons: RESCUE_BUTTON.fire, aimX: 1 })
      const delta = Math.abs(Math.atan2(Math.sin(station.flailAngle - previous), Math.cos(station.flailAngle - previous)))
      expect(delta).toBeLessThanOrEqual(12 / 60 + .001); movement += delta; previous = station.flailAngle
      expect(Math.abs(station.flailSpeed)).toBeLessThanOrEqual(12)
    }
    expect(movement).toBeGreaterThan(2); expect(s.stats.shots).toBeGreaterThan(5)
    expect(s.bullets).toHaveLength(0)
    const target = spawnRescueEnemy(s, 'moth', s.ship.x + HULL_RADIUS + .6 + Math.cos(station.flailAngle) * 3.3, s.ship.y + Math.sin(station.flailAngle) * 3.3)!
    station.cooldown = 0; tick(s, { buttons: RESCUE_BUTTON.fire, aimX: 1 })
    expect(target.hp).toBeLessThan(target.maxHp)
  })
})

describe('Starling rescue mission and physical upgrades', () => {
  it('generates reproducible reachable five-cage maps across all biomes', () => {
    for (const biome of [0, 1, 2] as const) for (let seed = 0; seed < 15; seed++) {
      const world = createRescueWorld(seed, biome); expect(rescueMapReachable(world)).toBe(true); expect(world.cages).toHaveLength(5)
      expect(createRescueWorld(seed, biome)).toEqual(world)
    }
  })
  it('delivers a gem, requires physical pickup and sockets it once', () => {
    const s = createRescueGame({ solo: false }); openRescueGift(s, s.world.gifts[0]!.id)
    const p = s.crew[0]!, gem = s.gems[0]!; p.x = gem.x; p.y = -1.3; gem.y = -.9
    tick(s, { buttons: RESCUE_BUTTON.interact }); expect(p.gem).toBe(gem.id)
    tick(s); const spec = stationSpec('east'); p.x = spec.x; p.y = spec.y
    tick(s, { buttons: RESCUE_BUTTON.interact }); expect(p.gem).toBeNull(); expect(gem.socket).toBe('east'); expect(s.stats.sockets).toBe(1)
    expect(s.stations.find(st => st.id === 'east')!.upgrade).toBe('power')
    tick(s, { buttons: RESCUE_BUTTON.interact }, 10); expect(s.stats.sockets).toBe(1)
  })
  it('dropped gems remain in the sealed hull and recoverable', () => {
    const s = createRescueGame({ solo: false }); s.nextWave = 999; openRescueGift(s, s.world.gifts[0]!.id)
    s.gems[0]!.vx = 100; s.gems[0]!.vy = 30; tick(s, {}, 600)
    expect(s.gems[0]!.socket).toBeNull(); expect(s.gems[0]!.y).toBeGreaterThanOrEqual(-3.25); expect(Math.abs(s.gems[0]!.x)).toBeLessThan(4.3)
  })
  it('opens cages with damage, rescues by proximity and does not double count', () => {
    const s = createRescueGame({ solo: false }), cage = s.world.cages[0]!
    damageRescueCage(s, cage.id, 100); expect(cage.open).toBe(true); expect(s.stats.rescues).toBe(0)
    s.ship.x = cage.x; s.ship.y = cage.y; tick(s, {}, 30); expect(s.stats.rescues).toBe(1)
  })
  it('requires five rescues AND guardian defeat before portal extraction', () => {
    const s = createRescueGame({ solo: false }); s.nextWave = 999
    s.ship.x = s.world.portal.x; s.ship.y = s.world.portal.y; tick(s, {}, 100); expect(s.phase).toBe('playing')
    s.world.cages.forEach(c => { c.open = true; c.rescued = true }); s.stats.rescues = 5; tick(s)
    expect(s.guardianSpawned).toBe(true); const guardian = s.enemies.find(e => e.kind === 'guardian')!; expect(guardian).toBeDefined()
    damageRescueEnemy(s, guardian, 10000, s.ship.x, s.ship.y, true); tick(s, {}, 95); expect(s.phase).toBe('won')
  })
  it('caps enemies, preserves deterministic replay and resets per-run upgrades', () => {
    const a = createRescueGame({ seed: 77, solo: false }), b = createRescueGame({ seed: 77, solo: false })
    for (let i = 0; i < 600; i++) { const input = { ...neutralRescueInput(i), x: i % 120 < 60 ? 1 : -1 }; advanceRescueGame(a, { captain: input }); advanceRescueGame(b, { captain: input }) }
    expect(a).toEqual(b)
    for (let n = 0; n < 30; n++) spawnRescueEnemy(a, 'moth', 40, 40)
    expect(a.enemies.length).toBe(12)
    a.stations[0]!.upgrade = 'metal'; const again = restartRescueGame(a); expect(again.epoch).toBe(a.epoch + 1); expect(again.stations[0]!.upgrade).toBeNull()
  })
})
