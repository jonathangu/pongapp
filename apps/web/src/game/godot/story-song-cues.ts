import type { RescueState } from '@pongapp/game-core'

export type SongId = keyof typeof SONGS
export type SongCue = 'home' | 'opening' | 'sailing' | 'jungle' | 'space' | 'danger' | 'reflection' | 'ending' | 'afterglow' | 'unwritten'
export const SONGS = {
  tides: { title: 'Tides of the Old World', theme: 'Family & inheritance', duration: 377.693 },
  turn: { title: 'Each Way I Turn', theme: 'Choices & becoming', duration: 253.8 },
  rope: { title: 'Tide Rope', theme: 'A gentle crossing · instrumental', duration: 207.6 },
  saltwake: { title: 'Saltwake Run', theme: 'All hands · instrumental', duration: 159.12 },
  moonshot: { title: 'Moonshot Fever', theme: 'Beyond the horizon · instrumental', duration: 123.76 },
  tiger: { title: 'Tiger Map', theme: 'A short jungle loop · instrumental', duration: 19.96 },
  hearts: { title: 'Three Hearts Inside a Stolen Ship', theme: 'Family beyond the charts', duration: 304.72 },
} as const
export const songForCue = (cue: SongCue): SongId | null => cue === 'unwritten' ? 'hearts' : cue === 'opening' || cue === 'ending' ? 'tides' : cue === 'reflection' || cue === 'afterglow' ? 'turn' : cue === 'sailing' ? 'rope' : cue === 'danger' ? 'saltwake' : cue === 'space' ? 'moonshot' : cue === 'jungle' ? 'tiger' : null
export const songCueVolume = (cue: SongCue) => ['opening', 'reflection', 'ending', 'unwritten'].includes(cue) ? .55 : cue === 'home' ? 1 : .65
export function storySongCue(state: RescueState): SongCue {
  if (state.odyssey?.pending || state.odyssey && state.phase === 'won') return 'unwritten'
  if (state.odyssey?.stage === 'inner') return 'sailing'
  if (state.story?.pending === 'watch') return 'opening'
  if (state.story?.pending === 'small-hands') return 'reflection'
  if (state.story?.pending === 'home') return 'ending'
  if (state.phase === 'won' && state.story) return 'afterglow'
  if (state.guardianSpawned && !state.guardianDefeated) return 'danger'
  if (state.region === 'space' || state.region === 'sky') return 'space'
  if (state.region === 'jungle') return 'jungle'
  return 'sailing'
}
