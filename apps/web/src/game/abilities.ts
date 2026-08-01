import type { AbilityId } from '@pongapp/game-core'

/**
 * What a skill actually does, in words a first-time player can act on.
 *
 * The ability button used to read "DASH · READY" and nothing else, which reports
 * a state nobody asked about for a verb they have never seen. Splitting the copy
 * in two lets the same sentence appear in both places it is needed without
 * either one being a truncation of the other:
 *
 * - `verb` is short enough to sit under the name on the button *during* a match,
 *   where there is no room and no time to read a paragraph.
 * - `detail` is the full explanation for the home screen, the how-to-play panel
 *   and the screen-reader label, where there is room and the ball is not moving.
 *
 * Both are phrased as what happens, not as what the ability is called. "Jump to
 * where you are aiming" is actionable; "reposition" is a thesaurus entry.
 */
export interface AbilityInfo {
  label: string
  verb: string
  detail: string
}

export const ABILITY_INFO: Record<AbilityId, AbilityInfo> = {
  dash: {
    label: 'Dash',
    verb: 'Jump to where you are aiming',
    detail: 'Instantly moves your paddle a third of the court toward your aim. Use it when the ball is going wide and you will not reach it in time.',
  },
  bend: {
    label: 'Bend',
    verb: 'Curve your next return',
    detail: 'The next ball you hit swerves in the air instead of travelling straight, so it lands somewhere your opponent did not move to.',
  },
  guard: {
    label: 'Guard',
    verb: 'Block one ball that gets past',
    detail: 'Puts a wall across your end that saves exactly one shot, then disappears. Your safety net when you are out of position.',
  },
  pulse: {
    label: 'Pulse',
    verb: 'Swat the ball away',
    detail: 'A short burst just in front of your paddle. Time it as the ball arrives and it fires back hard — mistime it and nothing happens.',
  },
}
