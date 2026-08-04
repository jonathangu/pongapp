import { describe, expect, it } from 'vitest'
import { advanceLocalMalletPreview, interpolatePoint } from '../src/game/prediction'

describe('two-dimensional online prediction', () => {
  it('advances a local mallet in physical court space and corrects softly', () => {
    const point = advanceLocalMalletPreview({ x: 0.5, y: 0.8 }, { x: 0.5, y: 0.8 }, { x: 0.8, y: 0.5 }, 1 / 60, 4 / 3)
    expect(point.x).toBeGreaterThan(0.5)
    expect(point.y).toBeLessThan(0.8)
  })

  it('interpolates both axes', () => {
    expect(interpolatePoint({ x: 0.2, y: 0.8 }, { x: 0.8, y: 0.2 }, 0.5)).toEqual({ x: 0.5, y: 0.5 })
  })
})
