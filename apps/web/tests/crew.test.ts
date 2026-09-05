import { describe, expect, it } from 'vitest'
import { createCoopGame } from '@pongapp/game-core'
import { neutralControl, stepLocal, validControl, type Controls } from '../src/online/LocalSimulation'
import { projectExpedition, vehicleAngle } from '../src/game/ExpeditionCanvas'
import { scoutInput } from '../src/game/SoloRiver'

describe('crew local controls and camera', () => {
  it('rejects malformed controls while accepting all supported crew jobs', () => {
    expect(validControl(neutralControl())).toBe(true)
    expect(validControl({ ...neutralControl(), steer: Infinity })).toBe(false)
    expect(validControl({ ...neutralControl(), station: 'captain' })).toBe(false)
    expect(validControl({ ...neutralControl(), action: 1 })).toBe(false)
  })
  it('does not repeat station commands when packets or snapshots are duplicated', () => {
    const s = createCoopGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]); s.phase = 'playing'
    const controls: Controls = { a: neutralControl(), b: { ...neutralControl(), station: 'engineer', stationSeq: 1 } }, consumed: Controls = {}
    stepLocal(s, controls, consumed); expect(s.players.b?.station).toBe('engineer')
    s.players.b!.station = 'gunner'
    stepLocal(s, structuredClone(controls), consumed); expect(s.players.b?.station).toBe('gunner')
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
  it('Scout takes the pilot job when the solo player changes to gunner', () => {
    const s = createCoopGame([{ id: 'solo-human', name: 'You' }, { id: 'solo-scout', name: 'Scout' }])
    s.players['solo-human']!.station = 'engineer'
    expect(scoutInput(s).station).toBe('pilot')
    s.players['solo-human']!.station = 'pilot'; s.hearts = 2; s.crew.scrap = 3
    expect(scoutInput(s).station).toBe('engineer')
  })
})
