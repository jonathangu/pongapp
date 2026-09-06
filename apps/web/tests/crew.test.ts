import { describe, expect, it } from 'vitest'
import { createCoopGame } from '@pongapp/game-core'
import { applyCrewControl, controlAdvances, neutralControl, stepLocal, validControl, type Controls } from '../src/online/LocalSimulation'
import { projectExpedition, vehicleAngle } from '../src/game/ExpeditionCanvas'
import { scoutInput } from '../src/game/SoloRiver'
describe('physical crew controls and camera',()=>{
  it('accepts four room destinations and rejects malformed controls',()=>{
    expect(validControl(neutralControl())).toBe(true)
    for(const station of ['left','right','shoot','recover'])expect(validControl({...neutralControl(),station})).toBe(true)
    for(const station of ['pilot','gunner','engineer','captain'])expect(validControl({...neutralControl(),station})).toBe(false)
    expect(validControl({...neutralControl(),steer:Infinity})).toBe(false)
    expect(validControl({...neutralControl(),action:1})).toBe(false)
  })
  it('applies only latest destination once, survives duplicate packets and preserves travel delay',()=>{
    const s=createCoopGame([{id:'a',name:'A'},{id:'b',name:'B'}]);s.phase='playing';s.tick=180;s.objects=[]
    const controls:Controls={a:neutralControl(),b:neutralControl()},consumed:Controls={}
    for(const station of ['right','recover','shoot'] as const)applyCrewControl(controls.b!,{station})
    stepLocal(s,structuredClone(controls),consumed)
    expect(s.players.b!.station).toBe('shoot');expect(s.crew.shotsFired).toBe(0)
    for(let i=0;i<60;i++)stepLocal(s,structuredClone(controls),consumed)
    expect(s.crew.actions.b?.shoot).toBe(1);expect(s.players.b!.deck.moving).toBe(false);expect(s.crew.shotsFired).toBe(1)
    const guest=structuredClone(s);stepLocal(guest,controls,structuredClone(consumed));expect(guest.crew.actions).toEqual(s.crew.actions)
    expect(controlAdvances(controls.b!,neutralControl())).toBe(false)
    expect(controlAdvances(neutralControl(),{...neutralControl(),stationSeq:65})).toBe(false)
    expect(validControl({...neutralControl(),stationSeq:-1})).toBe(false)
  })
  it('faces projected motion and keeps portrait forward view',()=>{
    for(const [w,h] of [[320,380],[390,510],[900,600]]){
      const back=projectExpedition(w!,h!,.5,.76),front=projectExpedition(w!,h!,.5,.65)
      expect(front[1]).toBeLessThan(back[1]);expect(Math.abs(front[0]-back[0])).toBeLessThan(w!*.02)
      expect(Math.abs(vehicleAngle(w!,h!,.5,0,.0125))).toBeLessThan(.15)
      expect(vehicleAngle(w!,h!,.5,.01,.0125)).toBeGreaterThan(0)
      expect(vehicleAngle(w!,h!,.5,-.01,.0125)).toBeLessThan(0)
    }
  })
  it('Scout chooses one support room and does not reroute mid-run or steer',()=>{
    const s=createCoopGame([{id:'solo-human',name:'You'},{id:'solo-scout',name:'Scout'}])
    expect(scoutInput(s).station).toBe('shoot');s.hearts=1;expect(scoutInput(s).station).toBe('recover')
    s.players['solo-scout']!.deck.moving=true;expect(scoutInput(s).station).toBeUndefined()
    s.players['solo-scout']!.deck.moving=false;s.players['solo-human']!.station='recover'
    expect(scoutInput(s).station).toBe('shoot');expect(scoutInput(s).steer).toBeUndefined()
  })
})
