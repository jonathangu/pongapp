import type { AbilityId } from '@pongapp/game-core'

interface AbilityCopy {
  label: string
  menu: string
  action: string
  effect: string
}

export const ABILITY_COPY: Record<AbilityId, AbilityCopy> = {
  dash: {
    label: 'Dash',
    menu: 'Dash · instantly jump toward the ball',
    action: 'Instantly jumps your paddle one-third of the wall toward the ball and stays there.',
    effect: 'Ghost paddles and an arrow show the jump from start to finish.',
  },
  bend: {
    label: 'Bend',
    menu: 'Bend · curve your next return',
    action: 'Arms your next return with extra curve for up to three seconds.',
    effect: 'Spinning arcs mean your curve shot is armed.',
  },
  guard: {
    label: 'Guard',
    menu: 'Guard · block one missed shot',
    action: 'Raises a shield for two seconds that saves one ball you miss.',
    effect: 'A bright shield line marks the protected wall.',
  },
  pulse: {
    label: 'Pulse',
    menu: 'Pulse · parry as the ball arrives',
    action: 'Opens a brief parry window; use it just before the ball reaches you.',
    effect: 'Three rings show the short parry window expanding from your paddle.',
  },
}
