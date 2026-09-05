import { describe, expect, it } from 'vitest'
import { advanceCoopGame, createCoopGame } from '../src'

function start() {
  const state = createCoopGame([{ id: 'left', name: 'Left' }, { id: 'right', name: 'Right' }], 42)
  for (let tick = 0; tick < 180; tick += 1) advanceCoopGame(state, {})
  return state
}

describe('Two Oars cooperative simulation', () => {
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
})
