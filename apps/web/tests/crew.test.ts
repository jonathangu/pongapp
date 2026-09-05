import { describe, expect, it } from 'vitest'
import { createCoopGame } from '@pongapp/game-core'
import { applyCrewControl, controlAdvances, neutralControl, stepLocal, validControl, type Controls } from '../src/online/LocalSimulation'
import { projectExpedition, vehicleAngle } from '../src/game/ExpeditionCanvas'
import { scoutInput } from '../src/game/SoloRiver'

describe('crew local controls and camera', () => {
  it('rejects malformed controls while accepting all supported crew jobs', () => {
    expect(validControl(neutralControl())).toBe(true)
    expect(validControl({ ...neutralControl(), steer: Infinity })).toBe(false)
    expect(validControl({ ...neutralControl(), station: 'captain' })).toBe(false)
    expect(validControl({ ...neutralControl(), action: 1 })).toBe(false)
  })
  it('drains coalesced tap counters once and reconciles acknowledged guest actions', () => {
    const s = createCoopGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]); s.phase = 'playing'
    s.hearts = 1; s.crew.scrap = 3
    const controls: Controls = { a: neutralControl(), b: neutralControl() }, consumed: Controls = {}
    for (let i = 0; i < 3; i++) applyCrewControl(controls.b!, { tap: 'right' })
    for (let i = 0; i < 6; i++) applyCrewControl(controls.b!, { tap: 'recover' })
    for (let i = 0; i < 3; i++) applyCrewControl(controls.b!, { tap: 'shoot' })
    for (let i = 0; i < 30; i++) stepLocal(s, structuredClone(controls), consumed)
    expect(s.crew.actions.b?.right).toBe(3); expect(s.crew.shotsFired).toBe(3); expect(s.hearts).toBe(2); expect(s.crew.scrap).toBe(0)
    const guest = structuredClone(s); stepLocal(guest, controls, structuredClone(consumed))
    expect(guest.crew.actions).toEqual(s.crew.actions); expect(guest.hearts).toBe(2)
    expect(controlAdvances(controls.b!, neutralControl())).toBe(false)
    expect(controlAdvances(neutralControl(), { ...neutralControl(), rightTaps: 65 })).toBe(false)
    expect(validControl({ ...neutralControl(), shootTaps: -1 })).toBe(false)
  })
  it('faces projected motion and gives portrait screens a forward view', () => {
    for (const [w,h] of [[320,380],[390,510],[900,600]]) {
      const back = projectExpedition(w!,h!,.5,.76), forward = projectExpedition(w!,h!,.5,.65)
      expect(forward[1]).toBeLessThan(back[1]); expect(Math.abs(forward[0]-back[0])).toBeLessThan(w! * .02)
      expect(Math.abs(vehicleAngle(w!,h!,.5,0,.0125))).toBeLessThan(.15)
      expect(vehicleAngle(w!,h!,.5,.01,.0125)).toBeGreaterThan(0)
      expect(vehicleAngle(w!,h!,.5,-.01,.0125)).toBeLessThan(0)
    }
  })
  it('Scout only makes occasional combat and emergency-repair taps, never steering', () => {
    const s = createCoopGame([{ id: 'solo-human', name: 'You' }, { id: 'solo-scout', name: 'Scout' }])
    s.tick = 210; s.hearts = 1; s.crew.scrap = 3
    expect(scoutInput(s).recoverTap).toBe(true); expect(scoutInput(s).rightTap).toBeUndefined()
    s.tick++; expect(scoutInput(s).recoverTap).toBe(false)
    s.tick = 225; s.objects = [{ id: 1, type: 'predator', x: .5, y: .2, radius: .04, phase: 0, drift: 0 }]
    expect(scoutInput(s).shootTap).toBe(true)
  })
})
