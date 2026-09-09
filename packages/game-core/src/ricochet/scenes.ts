import type { RicochetScene, RescueTarget } from './types'

export const RICOCHET_WIDTH = 360, RICOCHET_HEIGHT = 440
export const LAUNCHER = { x: 180, y: 402 }
export const MIRROR_HALF = 29
const targets = (points: number[][]): RescueTarget[] => points.map(([x, y], id) => ({ id, x: x!, y: y!, kind: (['bunny', 'bird', 'otter'] as const)[id % 3]! }))

/** Authored, not generated: geometry creates a reason to arrange the rebound. */
export const RICOCHET_SCENES: readonly RicochetScene[] = [
  {
    title: 'A little help around the bend', subtitle: 'Free the friends. Bring them aboard.', color: '#73e2d2',
    targets: targets([[180, 326], [106, 116], [136, 100], [152, 133]]),
    reefs: [{ a: { x: 58, y: 238 }, b: { x: 214, y: 238 } }],
    area: { left: 252, right: 310, top: 260, bottom: 316 },
    reflector: { x: 280, y: 274, angle: -95, mode: 'mirror' }, aim: -90,
  },
  {
    title: 'One spark. Three little fireworks.', subtitle: 'Burst pops a group. Split makes three.', color: '#ffc883',
    targets: targets([[180, 326], [157, 315], [203, 315],
      [106, 132], [82, 117], [116, 104], [194, 117], [179, 95], [212, 97], [255, 88], [238, 65], [279, 76]]),
    reefs: [{ a: { x: 45, y: 235 }, b: { x: 211, y: 235 } }],
    area: { left: 252, right: 310, top: 260, bottom: 316 },
    reflector: { x: 280, y: 265, angle: -87, mode: 'mirror' }, aim: -90,
  },
  {
    title: 'Make a little magic together', subtitle: 'A wide fan, a big burst, or one long beam?', color: '#c2b4ff',
    targets: targets([[75, 160], [85, 140], [106, 160], [91, 184], [65, 185],
      [207, 175], [188, 150], [170, 125], [151, 100], [133, 75],
      [281, 175], [281, 145], [281, 115], [281, 85], [281, 55]]),
    reefs: [{ a: { x: 38, y: 218 }, b: { x: 194, y: 218 } }],
    area: { left: 234, right: 310, top: 245, bottom: 318 },
    reflector: { x: 281, y: 275, angle: -94, mode: 'focus' }, aim: -51,
  },
]

export const PAYLOAD_LABELS = { plain: 'Bounce', burst: 'Burst', pierce: 'Pierce' } as const
export const LENS_LABELS = { mirror: 'Reflect', split: 'Split', focus: 'Focus' } as const
