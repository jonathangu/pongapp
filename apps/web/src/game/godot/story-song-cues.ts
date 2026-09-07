import type { RescueState } from '@pongapp/game-core'

export type SongId = 'tides' | 'turn'
export type SongCue = 'home' | 'opening' | 'sailing' | 'reflection' | 'ending' | 'afterglow'
export const SONGS = {
  tides: { title: 'Tides of the Old World', theme: 'Family & inheritance', duration: 377.693 },
  turn: { title: 'Each Way I Turn', theme: 'Choices & becoming', duration: 253.8 },
} as const
export const songForCue = (cue: SongCue): SongId | null => cue === 'opening' || cue === 'ending' ? 'tides' : cue === 'reflection' || cue === 'afterglow' ? 'turn' : null
export const songCueVolume = (cue: SongCue) => ['opening', 'reflection', 'ending'].includes(cue) ? .55 : 1
export function storySongCue(state: RescueState): SongCue {
  if (state.story?.pending === 'watch') return 'opening'
  if (state.story?.pending === 'small-hands') return 'reflection'
  if (state.story?.pending === 'home') return 'ending'
  if (state.phase === 'won' && state.story) return 'afterglow'
  return 'sailing'
}
