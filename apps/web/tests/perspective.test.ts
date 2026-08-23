import { describe, expect, it } from 'vitest'
import { screenPointToWorld, screenVectorToWorld, visiblePointerTarget } from '../src/game/perspective'

describe('air-hockey perspective', () => {
  it('keeps bottom view coordinates and rotates top view by 180 degrees', () => {
    expect(screenPointToWorld({ x: 0.2, y: 0.8 }, 'bottom')).toEqual({ x: 0.2, y: 0.8 })
    const rotated = screenPointToWorld({ x: 0.2, y: 0.8 }, 'top')
    expect(rotated.x).toBeCloseTo(0.8)
    expect(rotated.y).toBeCloseTo(0.2)
    expect(screenVectorToWorld({ x: 1, y: -1 }, 'top')).toEqual({ x: -1, y: 1 })
  })

  it('leads a touch target toward centre court so the thumb never covers the mallet', () => {
    expect(visiblePointerTarget({ x: 0.5, y: 0.8 }, 'bottom', 'bottom', 600, true).y).toBeCloseTo(0.7)
    expect(visiblePointerTarget({ x: 0.5, y: 0.2 }, 'top', 'bottom', 600, true).y).toBeCloseTo(0.3)
    expect(visiblePointerTarget({ x: 0.5, y: 0.8 }, 'bottom', 'bottom', 600, false)).toEqual({ x: 0.5, y: 0.8 })
  })
})
