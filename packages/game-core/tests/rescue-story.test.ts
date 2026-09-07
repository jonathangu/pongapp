import { describe, expect, it } from 'vitest'
import { STORY_IDS, advanceRescueGame, advanceRescueStory, applyRescueAction, chooseRescueStory, continueRescueStory, createRescueGame, decodeRescueSave, dockRescueShip, encodeRescueSave, neutralRescueInput, restartRescueGame, resumeRescueSolo, storyChoiceUnavailable, storyEncounter, validRescueAction, validRescueSaveState, validRescueStory, type RescueState, type StoryId } from '../src/rescue'

const game = () => createRescueGame({ story: true })
function scene(s: RescueState, id: StoryId) { s.story!.pending = id; s.story!.result = null }
function finish(s: RescueState, id: StoryId, choice: string) { scene(s, id); expect(chooseRescueStory(s, id, choice)).toBe(true); expect(continueRescueStory(s, id)).toBe(true) }

describe('The sea we carry: authoritative story', () => {
  it('puts mother and nine-year-old son aboard without replacing the useful companion', () => {
    const s = game()
    expect(s.crew.find(c => c.id === s.story!.motherId)?.origin).toBe('human')
    expect(s.crew.find(c => c.id === s.story!.sonId)?.name).toBe('Finn')
    expect(s.crew.find(c => c.id === 'pip')?.pet).toBe(true)
    expect(s.story!.pending).toBe('watch'); expect(validRescueSaveState(s)).toBe(true)
    expect(createRescueGame().story).toBeNull()
  })
  it('pauses the whole simulation during both a choice and its result, including online danger', () => {
    const s = game(); s.solo = false; s.ship.vx = 4
    const before = { time: s.time, x: s.ship.x, hp: s.ship.hp, wave: s.nextWave }
    for (let i = 0; i < 600; i++) advanceRescueGame(s, { captain: { ...neutralRescueInput(i), x: 1, assist: true } })
    expect({ time: s.time, x: s.ship.x, hp: s.ship.hp, wave: s.nextWave }).toEqual(before)
    expect(chooseRescueStory(s, 'watch', 'wind')).toBe(true)
    advanceRescueGame(s, {}); expect(s.time).toBe(0)
    expect(continueRescueStory(s, 'watch')).toBe(true)
    advanceRescueGame(s, {}); expect(s.time).toBeGreaterThan(0)
  })
  it('applies real costs once and rejects replayed, mismatched or unaffordable choices', () => {
    const s = game(); finish(s, 'watch', 'wind'); scene(s, 'whale')
    expect(chooseRescueStory(s, 'coat', 'patch')).toBe(false)
    expect(chooseRescueStory(s, 'whale', 'whale')).toBe(true)
    expect(s.ship.hp).toBe(10); expect(s.campaign.salvage).toBe(25)
    expect(chooseRescueStory(s, 'whale', 'whale')).toBe(false); expect(s.campaign.salvage).toBe(25)
    expect(continueRescueStory(s, 'coat')).toBe(false)
    expect(continueRescueStory(s, 'whale')).toBe(true)
    scene(s, 'whale'); expect(chooseRescueStory(s, 'whale', 'channel')).toBe(false)
    scene(s, 'coat'); s.campaign.salvage = 0
    expect(chooseRescueStory(s, 'coat', 'spares')).toBe(false)
    expect(chooseRescueStory(s, 'coat', 'patch')).toBe(true); expect(s.ship.hp).toBe(12)
  })
  it('keeps an available free choice even with no salvage and a single hull point', () => {
    for (const id of STORY_IDS) {
      const s = game(); scene(s, id); s.campaign.salvage = 0; s.ship.hp = 1
      const choices = storyEncounter(s, id).choices
      expect(choices.some(c => !storyChoiceUnavailable(s, c)), id).toBe(true)
      if (id === 'whale') expect(chooseRescueStory(s, id, 'whale')).toBe(false)
    }
  })
  it('rejects reward injection and unknown encounter actions before reaching the room', () => {
    expect(validRescueAction({ kind: 'story-choice', encounter: 'watch', choice: 'wind', salvage: 999 })).toBe(false)
    expect(validRescueAction({ kind: 'story-choice', encounter: 'cheat', choice: 'wind' })).toBe(false)
    expect(validRescueAction({ kind: 'story-choice', encounter: 'watch', choice: '<script>' })).toBe(false)
    expect(applyRescueAction(game(), { kind: 'story-continue', encounter: 'watch' })).toBeNull()
    expect(applyRescueAction(game(), { kind: 'dock' })).toBeNull()
  })
  it('gives Finn learned abilities on his actual crew member', () => {
    const s = game(); finish(s, 'watch', 'wind'); finish(s, 'sometimes', 'spoon')
    expect(s.crew.find(c => c.id === s.story!.sonId)?.ability).toBe('spark')
    finish(s, 'small-hands', 'teach')
    expect(s.crew.find(c => c.id === s.story!.sonId)?.ability).toBe('pilot')
    expect(s.campaign.salvage).toBe(7)
  })
  it('remembers the coat, whale and watch in later scenes and both endings', () => {
    const s = game(); finish(s, 'watch', 'carry'); finish(s, 'whale', 'whale'); finish(s, 'coat', 'patch')
    expect(storyEncounter(s, 'sometimes').paragraphs.join(' ')).toContain('scrap of coat lining')
    expect(storyEncounter(s, 'small-hands').paragraphs.join(' ')).toContain('whale is still there')
    expect(storyEncounter(s, 'home').paragraphs.join(' ')).toContain('coat keeps the sea out')
    expect(storyEncounter(s, 'home').choices[0]!.response).toContain('still stopped')
    s.story!.history[0]!.choice = 'wind'
    expect(storyEncounter(s, 'home').choices[0]!.response).toContain('winds it once')
  })
  it('saves a decision before continue, without re-awarding it on load or retry', () => {
    const s = game(); finish(s, 'watch', 'wind'); scene(s, 'whale'); chooseRescueStory(s, 'whale', 'whale')
    const saved = decodeRescueSave(encodeRescueSave(s))!
    expect(saved.story).toEqual(s.story)
    const resumed = resumeRescueSolo(saved)
    expect(chooseRescueStory(resumed, 'whale', 'whale')).toBe(false)
    expect(resumed.campaign.salvage).toBe(25)
    expect(continueRescueStory(resumed, 'whale')).toBe(true)
    expect(restartRescueGame(resumed).story!.history).toEqual(s.story!.history)
  })
  it('keeps family aboard at distant ports and across subsequent voyages', () => {
    const s = game(); finish(s, 'watch', 'wind'); s.campaign.voyages = 4
    const finn = s.crew.find(c => c.id === s.story!.sonId)!; finn.tourEnds = 0
    s.ship.x = s.docks[0]!.x; s.ship.y = s.docks[0]!.y
    expect(dockRescueShip(s)).toBe(true)
    expect(s.crew.some(c => c.id === finn.id)).toBe(true)
    const next = restartRescueGame(s, true)
    expect(next.story!.sonId).toBe(finn.id); expect(validRescueSaveState(next)).toBe(true)
  })
  it('triggers the rescue arc and ending without skipping the final scene behind a won state', () => {
    const s = game(); finish(s, 'watch', 'wind'); s.time = 10; s.stats.travel = 25
    const steps: Array<[StoryId, number, string]> = [['whale', 0, 'channel'], ['first-light', 1, 'signal'], ['coat', 2, 'patch'], ['sometimes', 3, 'quiet'], ['small-hands', 4, 'read'], ['keeper', 5, 'together'], ['home', 5, 'pass']]
    for (const [id, rescues, choice] of steps) {
      s.stats.rescues = rescues; s.time += 5; s.guardianSpawned = rescues === 5
      if (id === 'home') s.phase = 'won'
      advanceRescueStory(s); expect(s.story!.pending, id).toBe(id)
      expect(chooseRescueStory(s, id, choice)).toBe(true); expect(continueRescueStory(s, id)).toBe(true)
    }
    advanceRescueStory(s); expect(s.story!.pending).toBeNull(); expect(s.story!.history).toHaveLength(8)
  })
  it('rejects malformed or unbounded story saves and missing family identities', () => {
    const s = game()
    const corrupt = (change: (x: Record<string, any>) => void) => { const raw = JSON.parse(encodeRescueSave(s)); change(raw.state); return decodeRescueSave(JSON.stringify(raw)) }
    expect(corrupt(x => { x.story.history = Array(9).fill({ encounter: 'watch', choice: 'wind', at: 0 }) })).toBeNull()
    expect(corrupt(x => { x.story.sonId = 'missing' })).toBeNull()
    expect(corrupt(x => { x.story.result = 'wind' })).toBeNull()
    expect(corrupt(x => { x.story.history = [null] })).toBeNull()
    expect(corrupt(x => { x.story.extra = 'unexpected' })).toBeNull()
    expect(validRescueStory({ ...s.story, history: [{ encounter: 'watch', choice: 'wind', at: 0 }, null] })).toBe(false)
  })
  it('keeps chapters in order when a rescue arrives before the travel encounter', () => {
    const s = game(); finish(s, 'watch', 'wind'); s.time = 5; s.stats.rescues = 1
    advanceRescueStory(s); expect(s.story!.pending).toBeNull()
    s.time = 9; s.stats.travel = 20; advanceRescueStory(s); expect(s.story!.pending).toBe('whale')
  })
  it('moves an en-route AI companion aside when a human takes its cannon', () => {
    const s = game(); finish(s, 'watch', 'wind')
    const finn = s.crew.find(c => c.id === s.story!.sonId)!, pip = s.crew.find(c => c.id === 'pip')!
    finn.pet = false; finn.commandSeq = -1; pip.seat = null; pip.order = 'east'; pip.commandSeq = -1
    advanceRescueGame(s, { [finn.id]: { ...neutralRescueInput(5), assist: true, command: 'east', commandCrew: finn.id } })
    expect(finn.order).toBe('east'); expect(pip.order).not.toBe('east')
  })
})
