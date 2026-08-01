import type { AbilityId } from '@pongapp/game-core'

interface AbilityCopy {
  label: string
  menu: string
  action: string
}

export const ABILITY_COPY: Record<AbilityId, AbilityCopy> = {
  dash: {
    label: 'Boost',
    menu: 'Boost · surge toward your aim',
    action: 'Surges your paddle one-third of the wall in the direction you are aiming.',
  },
  bend: {
    label: 'Bend',
    menu: 'Bend · curve your next return',
    action: 'Arms your next return with extra curve for up to three seconds.',
  },
  guard: {
    label: 'Guard',
    menu: 'Guard · block one missed shot',
    action: 'Raises a shield for two seconds that saves one ball you miss.',
  },
  pulse: {
    label: 'Pulse',
    menu: 'Pulse · parry as the ball arrives',
    action: 'Opens a brief parry window; use it just before the ball reaches you.',
  },
}

/** Guard remains protocol-compatible for old rooms, but new matches use three active, skillful choices. */
export const PLAYABLE_ABILITIES: AbilityId[] = ['dash', 'bend', 'pulse']
