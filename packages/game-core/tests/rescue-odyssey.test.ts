import { describe, expect, it } from 'vitest'
import { STORY_IDS, advanceLittleWing, advanceOdyssey, advanceRescueGame, applyRescueAction, chooseRescueStory, continueRescueStory, createRescueGame, damageRescueShip, decodeRescueSave, encodeRescueSave, restartRescueGame, shieldCovers, storyEncounter, validRescueAction, type RescueState } from '../src/rescue'

function completedSea() {
  const s = createRescueGame({ story: true, guided: true })
  s.seamanship!.step = 5; s.phase = 'won'; s.stats.rescues = 5
  for (const cage of s.world.cages) { cage.open = true; cage.hp = 0; cage.rescued = true }
  for (const id of STORY_IDS) { s.story!.pending = id; expect(chooseRescueStory(s, id, storyEncounter(s, id).choices[0]!.id)).toBe(true); continueRescueStory(s, id) }
  return s
}
function arrive(s: RescueState) { s.ship.x = s.world.portal.x; s.ship.y = s.world.portal.y; advanceOdyssey(s, 2) }

describe('three hearts beneath unwritten stars', () => {
  it('sequences the sky chapter only after the completed sea story', () => {
    const first = createRescueGame({ story: true, guided: true })
    expect(restartRescueGame(first, true).odyssey).toBeUndefined()
    const sea = completedSea(), sky = restartRescueGame(sea, true)
    expect(sky.region).toBe('sky'); expect(sky.odyssey?.pending).toBe('launch')
    expect(sky.world.cages).toHaveLength(0); expect(sky.story?.history).toHaveLength(8)
    expect(sky.story?.motherId).toBe(sea.story?.motherId); expect(sky.story?.sonId).toBe(sea.story?.sonId)
    expect(decodeRescueSave(encodeRescueSave(sky))).not.toBeNull()
  })
  it('pauses the entire shared world for manga scenes, including AI help', () => {
    const sky = restartRescueGame(completedSea(), true)
    const before = structuredClone(sky)
    for (let i = 0; i < 300; i++) advanceRescueGame(sky, {})
    expect(sky.time).toBe(before.time); expect(sky.ship).toEqual(before.ship); expect(sky.littleWing).toEqual(before.littleWing)
  })
  it('plays sky → space gate → living sphere, preserving the recorded pulse and family', () => {
    let s = restartRescueGame(completedSea(), true)
    s = applyRescueAction(s, { kind: 'odyssey-continue', encounter: 'launch' })!
    expect(s.odyssey?.pending).toBeNull(); arrive(s); expect(s.odyssey?.pending).toBe('flare')
    const skyEpoch = s.epoch
    s = applyRescueAction(s, { kind: 'odyssey-continue', encounter: 'flare' })!
    expect(s.region).toBe('space'); expect(s.epoch).toBeGreaterThan(skyEpoch); expect(s.odyssey?.pulse).toBe(true)
    expect(decodeRescueSave(encodeRescueSave(s))).not.toBeNull()
    arrive(s); expect(s.odyssey?.pending).toBe('gate')
    s = applyRescueAction(s, { kind: 'odyssey-continue', encounter: 'gate' })!
    expect(s.region).toBe('jungle'); expect(s.odyssey?.stage).toBe('inner')
    arrive(s); expect(s.odyssey?.pending).toBe('dragon')
    s = applyRescueAction(s, { kind: 'odyssey-continue', encounter: 'dragon' })!
    expect(s.littleWing?.remaining).toBe(6)
    arrive(s); expect(s.odyssey?.pending).toBe('unwritten')
    s = applyRescueAction(s, { kind: 'odyssey-continue', encounter: 'unwritten' })!
    expect(s.phase).toBe('won'); expect(s.odyssey?.history).toEqual(['launch', 'flare', 'gate', 'dragon', 'unwritten'])
    expect(s.story?.history).toHaveLength(8); expect(decodeRescueSave(encodeRescueSave(s))).not.toBeNull()
    const explore = restartRescueGame(s, true); arrive(explore)
    expect(explore.phase).toBe('playing'); expect(explore.odyssey?.pending).toBeNull()
  })
  it('does not accept invented, out-of-order, or repeated story actions', () => {
    const s = restartRescueGame(completedSea(), true)
    expect(validRescueAction({ kind: 'odyssey-continue', encounter: 'teleport' })).toBe(false)
    expect(applyRescueAction(s, { kind: 'odyssey-continue', encounter: 'gate' })).toBeNull()
    expect(applyRescueAction(s, { kind: 'odyssey-continue', encounter: 'launch' })).toBe(s)
    expect(applyRescueAction(s, { kind: 'odyssey-continue', encounter: 'launch' })).toBeNull()
    s.odyssey!.pending = 'gate'
    expect(applyRescueAction(s, { kind: 'odyssey-continue', encounter: 'gate' })).toBeNull()
    expect(s.odyssey!.history).not.toContain('gate')
  })
  it('makes the daughter a bounded occasional helper, never another human slot', () => {
    const s = createRescueGame({ story: true, guided: true }); s.story!.pending = null; s.seamanship!.step = 5
    const humans = s.crew.filter(c => !c.pet).length
    s.stats.rescues = 1; advanceLittleWing(s, 1 / 60)
    expect(s.littleWing!.remaining).toBe(6); expect(s.littleWing!.arrivals).toBe(1)
    expect(s.littleWing!.cooldown).toBeGreaterThanOrEqual(50); expect(s.littleWing!.cooldown).toBeLessThanOrEqual(75)
    expect(shieldCovers(s, Math.PI)).toBe(true)
    damageRescueShip(s, 5, 0, 0); expect(s.ship.hp).toBe(12)
    for (let i = 0; i < 420; i++) advanceLittleWing(s, 1 / 60)
    expect(s.littleWing!.remaining).toBe(0); expect(s.littleWing!.arrivals).toBe(1)
    expect(s.crew.filter(c => !c.pet)).toHaveLength(humans)
    expect(decodeRescueSave(encodeRescueSave(s))).not.toBeNull()
  })
  it('keeps legacy save validation strict while adding a bounded chapter schema', () => {
    const s = createRescueGame(); s.world.cages = []
    expect(() => encodeRescueSave(s)).toThrow('safely saved')
    const sky = restartRescueGame(completedSea(), true)
    sky.odyssey!.history = ['launch', 'launch']; sky.odyssey!.pending = null
    expect(() => encodeRescueSave(sky)).toThrow('safely saved')
  })
})
