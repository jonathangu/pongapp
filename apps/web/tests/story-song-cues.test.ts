import { describe, expect, it } from 'vitest'
import { createRescueGame } from '@pongapp/game-core'
import { SONGS, songForCue, songCueVolume, storySongCue } from '../src/game/godot/story-song-cues'

describe('two complementary original song cues', () => {
  it('keeps Tides as the opening and family-ending theme', () => {
    const s = createRescueGame({ story: true })
    expect(songForCue(storySongCue(s))).toBe('tides')
    s.phase = 'won'; s.story!.pending = 'home'
    expect(storySongCue(s)).toBe('ending'); expect(songForCue(storySongCue(s))).toBe('tides')
  })
  it('uses Each Way I Turn for practice and the next chapter, without replacing the farewell', () => {
    const s = createRescueGame({ story: true }); s.story!.pending = 'small-hands'
    expect(storySongCue(s)).toBe('reflection'); expect(songForCue(storySongCue(s))).toBe('turn')
    s.story!.pending = null; s.phase = 'won'
    expect(storySongCue(s)).toBe('afterglow'); expect(songForCue(storySongCue(s))).toBe('turn')
  })
  it('does not assign automatic narrative music to sailing or overwrite manual home selection', () => {
    const s = createRescueGame({ story: true }); s.story!.pending = null
    expect(storySongCue(s)).toBe('sailing'); expect(songForCue('sailing')).toBeNull(); expect(songForCue('home')).toBeNull()
    expect(storySongCue(createRescueGame())).toBe('sailing')
  })
  it('ducks both reading themes and identifies the two complete recordings', () => {
    expect(songCueVolume('reflection')).toBe(.55); expect(songCueVolume('ending')).toBe(.55)
    expect(songCueVolume('afterglow')).toBe(1)
    expect(SONGS.tides.title).toBe('Tides of the Old World'); expect(SONGS.turn.title).toBe('Each Way I Turn')
    expect(SONGS.turn.duration).toBeGreaterThan(253)
  })
})
