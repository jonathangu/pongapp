import { describe, expect, it } from 'vitest'
import { advanceCoopGame, createCoopGame, expeditionWorld, ORBIT_LAP, orbitDelta, RECOVERY_WORK, type CoopGameState, type RiverObject } from '../src'

function start(seed = 42) {
  const s = createCoopGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], seed)
  for (let t = 0; t < 180; t++) advanceCoopGame(s, {})
  s.objects = []; return s
}
const rock = (s: CoopGameState): RiverObject => ({ id: 999, type: 'rock', x: s.boat.x, y: .755, radius: .04, phase: 0, drift: 0 })
const enemy = (id = 90, x = .5, y = .4): RiverObject => ({ id, type: 'predator', enemy: 'ambusher', x, y, radius: .04, phase: 0, drift: 0, hp: 4, maxHp: 4, age: 0 })
const step = (s: CoopGameState, n: number) => { for (let t = 0; t < n; t++) advanceCoopGame(s, {}) }

describe('orbital hybrid expedition ruleset10', () => {
  it('nudges immediately for either player, repeated taps move farther, and coasting settles', () => {
    const one = start(), many = start()
    advanceCoopGame(one, { b: { paddle: 0, rightTap: true } })
    expect(one.rulesetVersion).toBe(10); expect(one.boat.x).toBeGreaterThan(.5)
    for (let t = 0; t < 60; t++) advanceCoopGame(many, { a: { paddle: 0, rightTap: t < 3 } })
    step(one, 60); expect(many.boat.x).toBeGreaterThan(one.boat.x); expect(one.boat.heading).toBe(0)
    const x = one.boat.x; step(one, 20); expect(one.boat.x).toBe(x)
    advanceCoopGame(one, { a: { paddle: 0, leftTap: true } }); expect(one.boat.x).toBeLessThan(x)
  })
  it('cancels opposite taps and holds but responds to a held direction and fire', () => {
    const s = start(); advanceCoopGame(s, { a: { paddle: 0, leftTap: true }, b: { paddle: 0, rightTap: true } })
    expect(s.boat.x).toBe(.5)
    for(let t=0;t<20;t++)advanceCoopGame(s,{a:{paddle:0,steer:1},b:{paddle:0,steer:-1}})
    expect(s.boat.x).toBeCloseTo(.5)
    for (let t = 0; t < 100; t++) advanceCoopGame(s, { a: { paddle: 1, steer: 1, action: true, flare: true } })
    expect(s.boat.x).toBeGreaterThan(2); expect(s.crew.shotsFired).toBeGreaterThan(10); expect(s.rushTicks).toBe(0)
  })
  it('completes full orbits in both directions, with no seam jump or side stop', () => {
    for(const direction of [-1,1]){
      const s=start();let traveled=0
      for(let t=0;t<300;t++){s.objects=[];const before=s.boat.x;advanceCoopGame(s,{a:{paddle:0,steer:direction}});const delta=orbitDelta(s.boat.x,before);expect(delta*direction).toBeGreaterThan(0);expect(Math.abs(delta)).toBeLessThan(.03);traveled+=delta;expect(s.boat.x).toBeGreaterThanOrEqual(0);expect(s.boat.x).toBeLessThan(ORBIT_LAP)}
      expect(traveled*direction).toBeGreaterThan(ORBIT_LAP)
    }
  })
  it('persists shared recovery progress and works without salvage', () => {
    const s = start(); s.hearts = 1; s.crew.scrap = 3
    for (let t = 0; t < 2; t++) advanceCoopGame(s, { a: { paddle: 0, recoverTap: true }, b: { paddle: 0, recoverTap: true } })
    step(s, 40); expect(s.crew.repair).toBe(RECOVERY_WORK*.8); expect(s.hearts).toBe(1)
    advanceCoopGame(s, { a: { paddle: 0, recoverTap: true } })
    expect(s.hearts).toBe(2); expect(s.crew.scrap).toBe(0); expect(s.crew.repair).toBe(0)
    for (let t = 0; t < 5; t++) advanceCoopGame(s, { a: { paddle: 0, recoverTap: true } })
    expect(s.hearts).toBe(3)
  })
  it('cannot overheal when both players finish a repair at once', () => {
    const s = start(); s.hearts = 2; s.crew.scrap = 9; s.crew.repair = RECOVERY_WORK-1
    advanceCoopGame(s, { a: { paddle: 0, recoverTap: true }, b: { paddle: 0, recoverTap: true } })
    expect(s.hearts).toBe(3); expect(s.crew.scrap).toBe(6); expect(s.crew.repair).toBe(0)
  })
  it('fires a real slow shell, then damages a group only on impact', () => {
    const s = start(); s.objects = [enemy(), enemy(91, .54, .42)]
    advanceCoopGame(s, { b: { paddle: 0, shootTap: true } })
    expect(s.objects.map(o => o.hp)).toEqual([4,4]); expect(s.crew.shots).toHaveLength(1)
    const y = s.crew.shots[0]!.y; step(s, 1)
    expect(Math.abs(s.crew.shots[0]!.y - y)).toBeLessThan(.02)
    for (let t = 0; t < 50 && !s.crew.explosions.length; t++) advanceCoopGame(s, {})
    expect(s.crew.explosions[0]?.radius).toBe(.2); expect(s.crew.kills).toBe(2)
  })
  it('preserves burst taps, has no unattended human auto-fire, and expires untargeted shells', () => {
    const s = start()
    for (let t = 0; t < 3; t++) advanceCoopGame(s, { a: { paddle: 0, shootTap: true } })
    step(s, 28); expect(s.crew.shotsFired).toBe(3); expect(s.crew.pendingShots).toHaveLength(0)
    for (let t = 0; t < 120; t++) { s.objects = []; advanceCoopGame(s, {}) }
    expect(s.crew.shotsFired).toBe(3); expect(s.crew.shots).toHaveLength(0)
  })
  it('equips upgrades automatically without a choice or a manual upgrade packet', () => {
    const s = start(); advanceCoopGame(s, { a: { paddle: 0, upgrade: 'chain' } }); expect(s.crew.upgrades).toEqual([])
    s.tick = 1259; advanceCoopGame(s, {})
    expect(s.crew.upgrades).toEqual(['twin']); expect(s.crew.choiceTicks).toBe(0)
    advanceCoopGame(s, { a: { paddle: 0, shootTap: true } }); expect(s.crew.shotsFired).toBe(2)
  })
  it('spawns more than 24 enemies in the first 20 seconds and bounds snapshot cost', () => {
    const s = start(); const ids = new Set<number>(); let maxBytes = 0
    for (let t = 0; t < 7200; t++) {
      s.invulnerableTicks = 100
      advanceCoopGame(s, { a: { paddle: 0, shootTap: true }, b: { paddle: 0, shootTap: true } })
      if (t < 1200) for (const o of s.objects) if (o.type === 'predator') ids.add(o.id)
      expect(s.objects.length).toBeLessThanOrEqual(80); expect(s.crew.shots.length).toBeLessThanOrEqual(48)
      expect(s.crew.explosions.length).toBeLessThanOrEqual(16); expect(s.crew.pendingShots.length).toBeLessThanOrEqual(6)
      maxBytes = Math.max(maxBytes, JSON.stringify(s).length)
    }
    expect(ids.size).toBeGreaterThan(24); expect(maxBytes).toBeLessThan(60000)
  })
  it('locks an ambush after warning and makes chasers advance against the scenery', () => {
    const s = start(); s.objects = [{ ...enemy(), x: .08, y: .3, age: 55 }]
    advanceCoopGame(s, {}); const target = s.objects[0]!.targetX
    s.boat.x = .8; advanceCoopGame(s, {}); expect(s.objects[0]!.targetX).toBe(target); expect(s.objects[0]!.y).toBeGreaterThan(.3)
    s.objects = [{ ...enemy(), enemy: 'chaser', y: .98, age: 55 }]; advanceCoopGame(s, {}); expect(s.objects[0]!.y).toBeLessThan(.98)
  })
  it('bubble absorbs one hit; death freezes progress but not network ticks', () => {
    const s = start(); s.crew.bubble = 1; s.objects = [rock(s)]
    advanceCoopGame(s, {}); expect(s.hearts).toBe(3); expect(s.crew.bubble).toBe(0)
    s.objects = [rock(s)]; advanceCoopGame(s, {}); expect(s.hearts).toBe(2)
    s.hearts = 0; advanceCoopGame(s, {}); const tick = s.tick, end = s.crew.finishedTick
    advanceCoopGame(s, {}); expect(s.tick).toBe(tick + 1); expect(s.crew.finishedTick).toBe(end)
  })
  it('requires rescues and guardian defeat, not survival alone', () => {
    const s = start(); s.tick = s.durationTicks + 179; advanceCoopGame(s, {}); expect(s.crew.victory).toBe(false); expect(s.phase).toBe('finished')
    const win = start(); win.rescued = 3; win.crew.bossDefeated = true; advanceCoopGame(win, {}); expect(win.crew.victory).toBe(true)
  })
  it('visits all five worlds and always spawns the guardian', () => {
    const s = start(), worlds = new Set<number>()
    for (let t = 0; t < s.durationTicks; t++) { s.invulnerableTicks = 100; advanceCoopGame(s, {}); worlds.add(expeditionWorld(s)) }
    expect([...worlds]).toEqual([0,1,2,3,4]); expect(s.objects.some(o => o.enemy === 'boss')).toBe(true)
  })
  it('does not give idle players an automatic win across seeds', () => {
    for (let seed = 1; seed <= 12; seed++) { const s = start(seed); step(s, s.durationTicks); expect(s.crew.victory).toBe(false) }
  })
  it('is deterministic across pulses, projectiles, upgrades and damage', () => {
    const a = start(7), b = start(7)
    for (let t = 0; t < 7200; t++) {
      const inputs = { a: { paddle: 0, steer:t%120<60?1:-1,leftTap: t % 70 === 0, rightTap: t % 85 === 0, recoverTap: t % 17 === 0,recoverHeld:t%100<20 }, b: { paddle: 0, shootTap: t % 12 === 0,action:true } }
      advanceCoopGame(a, inputs); advanceCoopGame(b, inputs)
    }
    expect(a).toEqual(b)
  })
  it('makes a tap dash stronger than a short held nudge and a tap blast heavier than held fire',()=>{
    const tap=start(),hold=start()
    for(let t=0;t<10;t++){advanceCoopGame(tap,{a:{paddle:0,rightTap:t===0}});advanceCoopGame(hold,{a:{paddle:0,steer:1}})}
    expect(tap.boat.x).toBeGreaterThan(hold.boat.x)
    advanceCoopGame(tap,{a:{paddle:0,shootTap:true}});advanceCoopGame(hold,{a:{paddle:0,action:true}})
    expect(tap.crew.shots[0]!.damage).toBeGreaterThan(hold.crew.shots[0]!.damage)
    expect(tap.crew.shots[0]!.radius).toBeGreaterThan(hold.crew.shots[0]!.radius)
    const released=hold.crew.shotsFired;step(hold,40);expect(hold.crew.shotsFired).toBe(released)
  })
  it('fills recovery over time, saves partial work, and accelerates with salvage',()=>{
    for(const salvage of [0,3]){
      const s=start();s.hearts=2;s.crew.scrap=salvage;s.invulnerableTicks=10000
      const ticks=salvage?120:180
      for(let t=0;t<30;t++)advanceCoopGame(s,{a:{paddle:0,recoverHeld:true}})
      const saved=s.crew.repair;step(s,20);expect(s.crew.repair).toBe(saved)
      for(let t=30;t<ticks;t++)advanceCoopGame(s,{a:{paddle:0,recoverHeld:true}})
      expect(s.hearts).toBe(3);expect(s.crew.scrap).toBe(0);expect(s.crew.repair).toBe(0)
    }
  })
  it('collides, homes and splashes through the circumference seam',()=>{
    const s=start();s.boat.x=.01;s.objects=[{...rock(s),x:ORBIT_LAP-.02}]
    advanceCoopGame(s,{});expect(s.hearts).toBe(2)
    const shot=start();shot.boat.x=ORBIT_LAP-.02;shot.invulnerableTicks=1000
    shot.objects=[enemy(90,.03,.51),enemy(91,ORBIT_LAP-.05,.5)]
    advanceCoopGame(shot,{a:{paddle:0,shootTap:true}})
    expect(Math.abs(shot.crew.shots[0]!.vx)).toBeLessThan(.01)
    for(let t=0;t<40&&shot.crew.kills<2;t++)advanceCoopGame(shot,{})
    expect(shot.crew.kills).toBe(2)
  })
})
