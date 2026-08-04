import { describe, expect, it } from 'vitest'
import { screenPointToWorld, screenVectorToWorld } from '../src/game/perspective'

describe('air-hockey perspective', () => {
  it('keeps bottom view coordinates and rotates top view by 180 degrees', () => {
    expect(screenPointToWorld({ x: 0.2, y: 0.8 }, 'bottom')).toEqual({ x: 0.2, y: 0.8 })
    const rotated = screenPointToWorld({ x: 0.2, y: 0.8 }, 'top')
    expect(rotated.x).toBeCloseTo(0.8)
    expect(rotated.y).toBeCloseTo(0.2)
    expect(screenVectorToWorld({ x: 1, y: -1 }, 'top')).toEqual({ x: -1, y: 1 })
  })
})
