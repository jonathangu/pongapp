import { describe, expect, it } from 'vitest'
import { advanceCoopGame, createCoopGame, expeditionWorld } from '../src'

function start() {
  const state = createCoopGame([{ id: 'left', name: 'Left' }, { id: 'right', name: 'Right' }], 42)
  for (let tick = 0; tick < 180; tick += 1) advanceCoopGame(state, {})
  return state
}

describe('Two Oars cooperative simulation', () => {
  it('visits all five worlds and finishes at the stars',()=>{
    const state=start();const worlds=new Set<number>()
    for(let i=0;i<state.durationTicks;i++){state.invulnerableTicks=120;advanceCoopGame(state,{});worlds.add(expeditionWorld(state))}
    expect([...worlds]).toEqual([0,1,2,3,4]);expect(state.phase).toBe('finished')
  })
  it('a shared flare clears nearby predators and has a shared cooldown',()=>{
    const state=start();state.objects=[{id:99,type:'predator',x:.5,y:.65,radius:.04,phase:0,drift:0}]
    advanceCoopGame(state,{left:{paddle:0,flare:true},right:{paddle:0,flare:true}})
    expect(state.objects).toHaveLength(0);expect(state.hearts).toBe(3);expect(state.score).toBe(40)
    expect(state.flareCooldown).toBe(420)
    advanceCoopGame(state,{left:{paddle:0,flare:true}});expect(state.flareCooldown).toBe(419)
  })
  it('rewards rescues and relics and protects against consecutive collision damage',()=>{
    const state=start()
    for(const type of ['rescue','relic','rock','rock'] as const){state.objects=[{id:99,type,x:state.boat.x,y:.758,radius:.04,phase:0,drift:0}];advanceCoopGame(state,{})}
    expect(state.rescued).toBe(1);expect(state.relics).toBe(1);expect(state.hearts).toBe(2)
  })
  it('assigns one oar to each player and starts after a short countdown', () => {
    const state = start()
    expect(state.phase).toBe('playing')
    expect(state.players.left?.side).toBe('left')
    expect(state.players.right?.side).toBe('right')
  })

  it('moves faster when both players row and turns with one oar', () => {
    const together = start()
    const turning = start()
    for (let tick = 0; tick < 45; tick += 1) {
      advanceCoopGame(together, { left: { paddle: 1 }, right: { paddle: 1 } })
      advanceCoopGame(turning, { left: { paddle: 1 }, right: { paddle: 0 } })
    }
    expect(together.distance).toBeGreaterThan(turning.distance)
    expect(together.boat.x).toBeCloseTo(0.5, 3)
    expect(turning.boat.x).toBeGreaterThan(0.5)
  })

  it('uses a deterministic river for the same seed', () => {
    const one = createCoopGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 7)
    const two = createCoopGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 7)
    expect(one.objects).toEqual(two.objects)
    for (let tick = 0; tick < 300; tick += 1) { advanceCoopGame(one, {}); advanceCoopGame(two, {}) }
    expect(one).toEqual(two)
  })

  it('rewards sustained synchronized paddling with a Harmony Rush', () => {
    const state = start()
    for (let tick = 0; tick < 100; tick += 1) advanceCoopGame(state, { left: { paddle: 1 }, right: { paddle: 1 } })
    expect(state.rushTicks).toBeGreaterThan(0)
    expect(state.boat.speed).toBeGreaterThan(0.009)
  })
})
