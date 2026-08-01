import { describe, expect, it } from 'vitest'
import { courtRotationForSide, screenDirectionToLogical, screenFractionToLogical } from '../src/game/perspective'

describe('player-facing court perspective', () => {
  it('rotates every local wall to the bottom', () => {
    expect(courtRotationForSide('bottom')).toBe(0)
    expect(courtRotationForSide('top')).toBe(Math.PI)
    expect(courtRotationForSide('left')).toBe(-Math.PI / 2)
    expect(courtRotationForSide('right')).toBe(Math.PI / 2)
  })

  it('maps a shared left/right gesture to both opposite duel paddles', () => {
    expect(screenFractionToLogical(0.2, 'left', 'left')).toBeCloseTo(0.2)
    expect(screenFractionToLogical(0.2, 'right', 'left')).toBeCloseTo(0.2)
    expect(screenDirectionToLogical(1, 'left', 'left')).toBe(1)
    expect(screenDirectionToLogical(1, 'right', 'left')).toBe(1)
  })
})
