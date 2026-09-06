import { describe, expect, it } from 'vitest'
import { createCoopGame, createVersusGame } from '@pongapp/game-core'
import { applyCrewControl, controlAdvances, neutralControl, stepLocal, type Controls } from '../src/online/LocalSimulation'

describe('local prediction and idempotent actions',()=>{
  it('starts the crew running on the next local tick, without prematurely moving the ship',()=>{
    const state=createCoopGame([{id:'a',name:'A'},{id:'b',name:'B'}],42);state.phase='playing'
    const controls={a:{...neutralControl(),rightTaps:1},b:neutralControl()}
    stepLocal(state,controls,{})
    expect(state.boat.x).toBe(.5);expect(state.players.a!.deck.moving).toBe(true);expect(state.players.a!.station).toBe('right')
  })
  it('a duplicated tap packet switches only once, and two taps between frames are preserved',()=>{
    const state=createVersusGame([{id:'a',name:'A'},{id:'b',name:'B'}],42);state.phase='playing'
    const controls={a:{...neutralControl(),taps:1},b:neutralControl()};const consumed:Controls={}
    stepLocal(state,controls,consumed);expect(state.racers.a?.lane).toBe(1)
    stepLocal(state,structuredClone(controls),consumed);expect(state.racers.a?.lane).toBe(1)
    controls.a.taps=3;stepLocal(state,controls,consumed);expect(state.racers.a?.lane).toBe(0)
    stepLocal(state,controls,consumed);expect(state.racers.a?.lane).toBe(1)
  })
  it('reconciles an already acknowledged guest tap without applying it twice',()=>{
    const host=createVersusGame([{id:'a',name:'A'},{id:'b',name:'B'}],42);host.phase='playing'
    const controls={a:neutralControl(),b:{...neutralControl(),taps:1}};const consumed:Controls={}
    stepLocal(host,controls,consumed)
    const guest=structuredClone(host);stepLocal(guest,controls,structuredClone(consumed))
    expect(guest.racers.b?.lane).toBe(host.racers.b?.lane)
  })
  it('keeps a manual target until an explicit selection change, despite neutral teammate input',()=>{
    const state=createCoopGame([{id:'a',name:'A'},{id:'b',name:'B'}]);state.phase='playing'
    const controls={a:neutralControl(),b:neutralControl()},consumed:Controls={}
    applyCrewControl(controls.a,{targetId:42});stepLocal(state,controls,consumed)
    for(let t=0;t<30;t++)stepLocal(state,structuredClone(controls),consumed)
    expect(state.crew.targetId).toBe(42)
    applyCrewControl(controls.b,{targetId:43});stepLocal(state,controls,consumed);expect(state.crew.targetId).toBe(43)
    applyCrewControl(controls.a,{targetId:42});stepLocal(state,controls,consumed);expect(state.crew.targetId).toBe(42)
    applyCrewControl(controls.a,{targetId:null});stepLocal(state,controls,consumed);expect(state.crew.targetId).toBeNull()
  })
  it('preserves a station through repeated packets and rejects a stale destination',()=>{
    const s=createCoopGame([{id:'a',name:'A'},{id:'b',name:'B'}]);s.phase='playing';s.hearts=2;s.invulnerableTicks=10000
    const controls={a:neutralControl(),b:neutralControl()},consumed:Controls={}
    applyCrewControl(controls.a,{station:'shoot'})
    const held=structuredClone(controls.a)
    for(let t=0;t<100;t++)stepLocal(s,structuredClone(controls),consumed)
    expect(s.crew.shotsFired).toBe(2);expect(s.crew.actions.a?.shoot).toBe(1);expect(s.crew.repair).toBe(0)
    applyCrewControl(controls.a,{station:'recover'})
    expect(controlAdvances(controls.a,held)).toBe(false)
    const fired=s.crew.shotsFired,repair=s.crew.repair
    for(let t=0;t<30;t++)stepLocal(s,controls,consumed)
    expect(s.crew.shotsFired).toBe(fired);expect(s.crew.repair).toBe(repair);expect(Math.abs(s.boat.heading)).toBeLessThan(.0001)
  })
})
