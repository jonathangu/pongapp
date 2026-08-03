import { describe, expect, it } from 'vitest'
import { courtRotationForSide, screenDirectionToLogical, screenFractionToLogical } from '../src/game/perspective'

describe('player-facing court perspective', () => {
  it('rotates either duel seat to the bottom', () => {
    expect(courtRotationForSide('bottom')).toBe(0)
    expect(courtRotationForSide('top')).toBe(Math.PI)
  })

  it('mirrors gestures when the top player views themselves from below', () => {
    expect(screenFractionToLogical(0.2, 'bottom', 'bottom')).toBeCloseTo(0.2)
    expect(screenFractionToLogical(0.2, 'top', 'top')).toBeCloseTo(0.8)
    expect(screenDirectionToLogical(1, 'bottom', 'bottom')).toBe(1)
    expect(screenDirectionToLogical(1, 'top', 'top')).toBe(-1)
  })
})
