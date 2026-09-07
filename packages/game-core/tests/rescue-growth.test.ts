import { describe, expect, it } from 'vitest'
import { createRescueGame, decodeRescueSave, encodeRescueSave, storyEncounter, storyReflections } from '../src/rescue'

describe('Each Way I Turn: remembered choices and growing', () => {
  it('does not invent a life lesson before a choice has been made', () => {
    expect(storyReflections(createRescueGame())).toEqual([])
    expect(storyReflections(createRescueGame({ story: true }))).toEqual([])
  })
  it('reflects real detour, neighbor and teaching choices without changing state or assigning scores', () => {
    const s = createRescueGame({ story: true }); s.story!.pending = null
    s.story!.history = [{ encounter: 'whale', choice: 'whale', at: 0 }, { encounter: 'first-light', choice: 'share', at: 0 }, { encounter: 'small-hands', choice: 'teach', at: 0 }]
    const before = structuredClone(s)
    const prose = storyReflections(s).map(r => r.body).join(' ')
    expect(prose).toContain('real cost'); expect(prose).toContain('Six spare parts'); expect(prose).toContain('practice beside her')
    expect(prose).not.toContain('When her voice returned'); expect(s).toEqual(before)
    expect(storyReflections(decodeRescueSave(encodeRescueSave(s))!)).toEqual(storyReflections(s))
  })
  it('gives careful navigation, radio help and reading bearings their own interpretations', () => {
    const s = createRescueGame({ story: true }); s.story!.pending = null
    s.story!.history = [{ encounter: 'whale', choice: 'channel', at: 0 }, { encounter: 'first-light', choice: 'signal', at: 0 }, { encounter: 'small-hands', choice: 'read', at: 0 }, { encounter: 'home', choice: 'compass', at: 0 }]
    const prose = storyReflections(s).map(r => r.body).join(' ')
    expect(prose).toContain('deeper channel'); expect(prose).toContain('stayed until help answered'); expect(prose).toContain('voice steadied'); expect(prose).toContain('still a wheel to turn')
  })
  it('brings Iona and repeated practice back according to earlier choices', () => {
    const s = createRescueGame({ story: true }); s.story!.history = [{ encounter: 'first-light', choice: 'share', at: 0 }, { encounter: 'sometimes', choice: 'spoon', at: 0 }]
    expect(storyEncounter(s, 'keeper').paragraphs.join(' ')).toContain('Iona recognizes Finn’s call')
    expect(storyEncounter(s, 'small-hands').paragraphs.join(' ')).toContain('checks the radio')
    s.story!.history = [{ encounter: 'first-light', choice: 'signal', at: 0 }]
    expect(storyEncounter(s, 'keeper').paragraphs.join(' ')).toContain('harbor tender we called')
    expect(storyEncounter(s, 'small-hands').paragraphs.join(' ')).toContain('brings the tool roll')
  })
})
