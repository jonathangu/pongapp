import { describe, expect, it } from 'vitest'
import { createRescueGame } from '@pongapp/game-core'
import { crossingObjective } from '../src/game/godot/CrossingGuide'

describe('one clear job for a solo captain', () => {
  it('never tells a solo captain to abandon steering for a station', () => {
    const s = createRescueGame({ story: true, guided: true }); s.captainMode = true
    for (let step = 0; step <= 5; step++) {
      s.seamanship!.step = step
      expect(['Helm', 'Together']).toContain(crossingObjective(s, true).job)
    }
    s.stats.rescues = 5; expect(crossingObjective(s, true).job).toBe('Together')
    s.guardianDefeated = true; expect(crossingObjective(s, true).job).toBe('Helm')
    s.odyssey = { stage: 'inner', pending: null, history: ['launch', 'flare', 'gate', 'dragon', 'unwritten'], pulse: true }
    expect(crossingObjective(s, true).title).toBe('A sea of your own')
  })
  it('keeps complementary human jobs for co-op practice', () => {
    const s = createRescueGame({ story: true, guided: true, solo: false }); s.seamanship!.step = 2
    expect(crossingObjective(s, false).job).toBe('Cannons')
    s.seamanship!.step = 4; expect(crossingObjective(s, false).job).toBe('Cook')
  })
})
