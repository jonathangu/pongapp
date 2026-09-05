import { describe, expect, it } from 'vitest'
import { advanceVersusGame, createVersusGame } from '../src'

function start() {
  const state = createVersusGame([{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }], 17)
  for (let tick = 0; tick < 180; tick += 1) advanceVersusGame(state, {})
  return state
}

describe('Rapid Rivals simulation', () => {
  it('starts two racers on opposite lanes', () => {
    const state = start()
    expect(state.phase).toBe('playing')
    expect(state.racers.one?.lane).toBe(0)
    expect(state.racers.two?.lane).toBe(1)
  })

  it('switches lanes and gives a speed kick on a rising input edge', () => {
    const state = start()
    const before = state.racers.one!.speed
    advanceVersusGame(state, { one: { paddle: 1 } })
    expect(state.racers.one!.lane).toBe(1)
    expect(state.racers.one!.speed).toBeGreaterThan(before)
    advanceVersusGame(state, { one: { paddle: 1 } })
    expect(state.racers.one!.lane).toBe(1)
    advanceVersusGame(state, { one: { paddle: 0 } })
    advanceVersusGame(state, { one: { paddle: 1 } })
    expect(state.racers.one!.lane).toBe(0)
  })

  it('is deterministic for a shared seed', () => {
    const roster = [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }]
    expect(createVersusGame(roster, 9)).toEqual(createVersusGame(roster, 9))
  })
})
