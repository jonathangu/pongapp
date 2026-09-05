import { describe, expect, it } from 'vitest'
import { createCoopGame, createVersusGame } from '@pongapp/game-core'
import { neutralControl, stepLocal, type Controls } from '../src/online/LocalSimulation'

describe('local prediction and idempotent actions',()=>{
  it('moves the boat on the very next local tick without a server response',()=>{
    const state=createCoopGame([{id:'a',name:'A'},{id:'b',name:'B'}],42);state.phase='playing'
    const controls={a:{...neutralControl(),steer:1},b:neutralControl()}
    stepLocal(state,controls,{})
    expect(state.boat.x).toBeGreaterThan(.5)
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
})
