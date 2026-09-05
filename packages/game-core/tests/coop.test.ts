import { describe, expect, it } from 'vitest'
import { advanceCoopGame, createCoopGame, expeditionWorld, type CoopGameState, type RiverObject } from '../src'

function start(seed = 42) {
  const state = createCoopGame([{ id: 'a', name: 'Pilot' }, { id: 'b', name: 'Gunner' }], seed)
  for (let tick = 0; tick < 180; tick++) advanceCoopGame(state, {})
  state.objects = []
  return state
}
function rock(s: CoopGameState): RiverObject { return { id: 99, type: 'rock', x: s.boat.x, y: .755, radius: .04, phase: 0, drift: 0 } }
function attacker(hp = 100): RiverObject { return { id: 90, type: 'predator', enemy: 'boss', x: .5, y: .2, radius: .1, phase: 0, drift: 0, hp, maxHp: hp, age: 0 } }

describe('two-person crew expedition', () => {
  it('assigns pilot and gunner, leaving engineer available', () => {
    const s = start()
    expect(s.rulesetVersion).toBe(7); expect(s.players.a?.station).toBe('pilot'); expect(s.players.b?.station).toBe('gunner')
  })
  it('steers immediately in both directions and coasts at the faster speed', () => {
    const a = start(), b = start()
    advanceCoopGame(a, { a: { paddle: 0, steer: -1 } }); advanceCoopGame(b, { a: { paddle: 0, steer: 1 } })
    expect(a.boat.x).toBeLessThan(.5); expect(b.boat.x).toBeGreaterThan(.5)
    for (let i = 0; i < 30; i++) advanceCoopGame(a, {})
    expect(a.boat.speed).toBeGreaterThan(.012)
  })
  it('ignores steering from a non-pilot', () => {
    const s = start(); advanceCoopGame(s, { b: { paddle: 0, steer: 1 } }); expect(s.boat.x).toBe(.5)
  })
  it('takes an empty station and requires the other person to accept an occupied swap', () => {
    const s = start()
    advanceCoopGame(s, { b: { paddle: 0, station: 'engineer' } }); expect(s.players.b?.station).toBe('engineer')
    advanceCoopGame(s, { a: { paddle: 0, station: 'engineer' } })
    expect(s.players.a?.station).toBe('pilot'); expect(s.crew.swap?.to).toBe('b')
    advanceCoopGame(s, { b: { paddle: 0, station: 'pilot' } })
    expect(s.players.a?.station).toBe('engineer'); expect(s.players.b?.station).toBe('pilot'); expect(s.crew.swap).toBeNull()
  })
  it('resolves simultaneous empty-station claims without duplicate occupancy', () => {
    const s = start(); advanceCoopGame(s, { a: { paddle: 0, station: 'engineer' }, b: { paddle: 0, station: 'engineer' } })
    expect(new Set(Object.values(s.players).map(p => p.station)).size).toBe(2)
  })
  it('does not grant repeated invincibility for holding the old paddle', () => {
    const s = start()
    for (let i = 0; i < 300; i++) advanceCoopGame(s, { a: { paddle: 1 }, b: { paddle: 1 } })
    expect(s.rushTicks).toBe(0)
    s.hearts = 3; s.invulnerableTicks = 0; s.objects = [rock(s)]; advanceCoopGame(s, { a: { paddle: 0, flare: true } })
    expect(s.rushTicks).toBeGreaterThan(0); expect(s.hearts).toBe(2); expect(s.crew.boostCooldown).toBe(360)
  })
  it('shield blocks, cools down, and does not clear distant enemies', () => {
    const s = start(); s.players.b!.station = 'engineer'
    s.objects = [rock(s), attacker()]
    advanceCoopGame(s, { b: { paddle: 0, flare: true } })
    expect(s.hearts).toBe(3); expect(s.objects.some(o => o.type === 'predator')).toBe(true); expect(s.crew.shieldCooldown).toBe(420)
    advanceCoopGame(s, { b: { paddle: 0, flare: true } }); expect(s.crew.shieldCooldown).toBe(419)
  })
  it('requires three earned scrap and sustained repair; cannot heal for free', () => {
    const s = start(); s.players.b!.station = 'engineer'; s.hearts = 1; s.crew.scrap = 3
    for (let i = 0; i < 110; i++) { s.objects = []; advanceCoopGame(s, { b: { paddle: 0, action: true } }) }
    expect(s.hearts).toBe(2); expect(s.crew.scrap).toBe(0)
    for (let i = 0; i < 120; i++) { s.objects = []; advanceCoopGame(s, { b: { paddle: 0, action: true } }) }
    expect(s.hearts).toBe(2)
  })
  it('manual turrets outperform unattended turrets and overheating requires cooling', () => {
    const auto = start(), manual = start(); auto.objects = [attacker(1000)]; manual.objects = [attacker(1000)]
    for (let i = 0; i < 170; i++) { advanceCoopGame(auto, {}); advanceCoopGame(manual, { b: { paddle: 0, action: true } }) }
    expect(manual.objects[0]!.hp).toBeLessThan(auto.objects[0]!.hp!)
    for (let i = 0; i < 30; i++) advanceCoopGame(manual, { b: { paddle: 0, action: true } })
    expect(manual.crew.overheated).toBe(true)
    for (let i = 0; i < 190; i++) { manual.objects = []; advanceCoopGame(manual, {}) }
    expect(manual.crew.overheated).toBe(false)
  })
  it('taking over an automatic turret shortens its outstanding firing delay', () => {
    const s = start(); s.crew.shotCooldown = 50
    advanceCoopGame(s, { b: { paddle: 0, action: true } })
    expect(s.crew.shotCooldown).toBeLessThanOrEqual(12)
  })
  it('keeps network ticks monotonic after death but freezes expedition progress', () => {
    const s = start(); s.hearts = 0; advanceCoopGame(s, {})
    const end = s.crew.finishedTick, tick = s.tick
    advanceCoopGame(s, {})
    expect(s.tick).toBe(tick + 1); expect(s.crew.finishedTick).toBe(end)
  })
  it('locks a predator lunge after telegraphing instead of endlessly tracking', () => {
    const s = start(); s.crew.shotCooldown = 1000
    s.objects = [{ ...attacker(), enemy: 'ambusher', x: .08, y: .3, age: 49, radius: .04 }]
    advanceCoopGame(s, {}); const target = s.objects[0]!.targetX
    s.boat.x = .8
    advanceCoopGame(s, {}); expect(s.objects[0]!.targetX).toBe(target); expect(s.objects[0]!.y).toBeGreaterThan(.3)
  })
  it('chaser advances against the scenery after its warning', () => {
    const s = start(); s.crew.shotCooldown = 1000
    s.objects = [{ ...attacker(), enemy: 'chaser', x: .2, y: .98, age: 55, radius: .04 }]
    advanceCoopGame(s, {}); expect(s.objects[0]!.y).toBeLessThan(.98)
  })
  it('allows only one shared upgrade per resupply and at most two unique slots', () => {
    const s = start(); s.crew.choiceTicks = 100
    advanceCoopGame(s, { a: { paddle: 0, upgrade: 'chain' }, b: { paddle: 0, upgrade: 'frost' } })
    expect(s.crew.upgrades).toEqual(['chain'])
    s.crew.choiceTicks = 100; advanceCoopGame(s, { a: { paddle: 0, upgrade: 'bubble' } })
    expect(s.crew.bubble).toBe(1); expect(s.crew.upgrades).toEqual(['chain','bubble'])
    s.crew.choiceTicks = 100; advanceCoopGame(s, { b: { paddle: 0, upgrade: 'twin' } })
    expect(s.crew.upgrades).toHaveLength(2)
  })
  it('bubble absorbs exactly one collision', () => {
    const s = start(); s.crew.bubble = 1; s.objects = [rock(s)]
    advanceCoopGame(s, {}); expect(s.hearts).toBe(3); expect(s.crew.bubble).toBe(0)
    s.objects = [rock(s)]; advanceCoopGame(s, {}); expect(s.hearts).toBe(2)
  })
  it('requires rescue objective and guardian defeat, not timer survival alone', () => {
    const s = start(); s.tick = s.durationTicks + 179; advanceCoopGame(s, {})
    expect(s.phase).toBe('finished'); expect(s.crew.victory).toBe(false)
    const win = start(); win.rescued = 3; win.crew.bossDefeated = true
    advanceCoopGame(win, {}); expect(win.crew.victory).toBe(true); expect(win.phase).toBe('finished')
  })
  it('visits all five worlds and spawns the final guardian', () => {
    const s = start(); const worlds = new Set<number>()
    for (let i = 0; i < s.durationTicks; i++) { s.invulnerableTicks = 120; advanceCoopGame(s, {}); worlds.add(expeditionWorld(s)) }
    expect([...worlds]).toEqual([0,1,2,3,4]); expect(s.crew.bossSpawned).toBe(true)
  })
  it('never rewards idle or one-button crews with an automatic win across seeds', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = start(seed)
      for (let i = 0; i < s.durationTicks && s.phase !== 'finished'; i++) advanceCoopGame(s, { b: { paddle: 0, action: true } })
      expect(s.crew.victory).toBe(false)
    }
  })
  it('is deterministic including enemies, station changes, shots, upgrades and damage', () => {
    const a = start(7), b = start(7)
    for (let i = 0; i < 2200; i++) {
      const inputs = { a: { paddle: 0, steer: Math.sin(i / 70) }, b: { paddle: 0, action: i % 300 < 160 } }
      advanceCoopGame(a, inputs); advanceCoopGame(b, inputs)
    }
    expect(a).toEqual(b)
  })
})
