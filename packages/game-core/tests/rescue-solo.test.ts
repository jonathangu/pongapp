import { describe, expect, it } from 'vitest'
import { RESCUE_BUTTON, TOGETHER_RADIUS, advanceRescueGame, applyRescueAction, createRescueGame, decodeRescueSave, encodeRescueSave, isSoloCrossing, neutralRescueInput, prepareSoloCrossing, restartRescueGame, resumeRescueSolo, spawnRescueBullet, spawnRescueEnemy, type RescueState } from '../src/rescue'

function game(seed = 73599) {
  const s = createRescueGame({ seed, story: true, guided: true, players: [{ id: 'captain', name: 'Mara' }] })
  s.captainMode = true; prepareSoloCrossing(s)
  applyRescueAction(s, { kind: 'story-choice', encounter: 'watch', choice: 'wind' })
  applyRescueAction(s, { kind: 'story-continue', encounter: 'watch' })
  return s
}
function tick(s: RescueState, fire = false) {
  advanceRescueGame(s, { captain: { ...neutralRescueInput(s.tick + 1), assist: true, buttons: fire ? RESCUE_BUTTON.fire : 0 } })
}

describe('solo: steer, trust your crew, call Together', () => {
  it('begins at the wheel with Finn firing and Pip cooking', () => {
    const s = game()
    expect(s.crew.find(p => !p.pet)?.seat).toBe('engine')
    expect(s.crew.find(p => p.id === s.story!.sonId)?.seat).toBe('east')
    expect(s.crew.find(p => p.id === 'pip')?.seat).toBe('galley')
    expect(s.vessels.map(v => v.role)).toEqual(['raider'])
    for (let i = 0; i < 220; i++) tick(s)
    expect(s.meal.remaining).toBeGreaterThan(0)
    expect(s.crew[0]!.seat).toBe('engine')
  })
  it('does not enable captain mode merely because an online crew has one connected player', () => {
    const s = createRescueGame({ story: true, guided: true, solo: true })
    expect(isSoloCrossing(s)).toBe(false)
    expect(s.vessels.map(v => v.role)).toEqual(['ally', 'merchant', 'raider'])
    s.captainMode = true; s.solo = false; expect(isSoloCrossing(s)).toBe(false)
  })
  it('clears only nearby hostile shots and cages, with short protection and a cooldown', () => {
    const s = game(); s.world.obstacles = []
    s.world.cages[0]!.x = s.ship.x + 12; s.world.cages[0]!.y = s.ship.y
    const distant = s.world.cages[1]!; distant.x = s.ship.x + TOGETHER_RADIUS + 8; distant.y = s.ship.y
    spawnRescueBullet(s, s.ship.x + 10, s.ship.y, 0, 0, 1, true)
    spawnRescueBullet(s, s.ship.x + 30, s.ship.y, 0, 0, 1, true)
    const friendShot = s.nextId; spawnRescueBullet(s, s.ship.x, s.ship.y + 5, 0, 0, 1, false)
    tick(s, true)
    expect(s.events.some(e => e.kind === 'together')).toBe(true)
    expect(s.world.cages[0]!.open).toBe(true); expect(distant.open).toBe(false)
    expect(s.bullets.filter(b => b.enemy)).toHaveLength(1)
    expect(s.bullets.some(b => b.id === friendShot)).toBe(true)
    expect(s.ship.invulnerable).toBe(1.25); expect(s.stats.blocks).toBe(1)
    expect(s.stations.find(st => st.id === 'starburst')!.cooldown).toBe(8)
  })
  it('requires a new press after cooldown, not a held fire input', () => {
    const s = game(); tick(s, true)
    let pulses = 1
    for (let i = 0; i < 650; i++) { tick(s, true); pulses += Number(s.events.some(e => e.kind === 'together')) }
    expect(pulses).toBe(1)
    tick(s); tick(s, true); expect(s.events.some(e => e.kind === 'together')).toBe(true)
  })
  it('damages an armored enemy but does not erase a boss with one tap', () => {
    const s = game(); const enemy = spawnRescueEnemy(s, 'guardian', s.ship.x + 15, s.ship.y)!
    tick(s, true); expect(enemy.hp).toBe(565); expect(s.guardianDefeated).toBe(false)
  })
  it('requires a valid active captain input and never fires during story, pause, or docking', () => {
    const s = game()
    for (const invalid of [{ active: false }, { x: NaN }, { assist: false }]) {
      advanceRescueGame(s, { captain: { ...neutralRescueInput(), assist: true, buttons: RESCUE_BUTTON.fire, ...invalid } })
      expect(s.events.some(e => e.kind === 'together')).toBe(false)
    }
    s.paused = true; tick(s, true); expect(s.stations.find(st => st.id === 'starburst')!.cooldown).toBe(0)
    s.paused = false; s.docked = s.docks[0]!.id; tick(s, true); expect(s.stats.blocks).toBe(0)
    s.docked = null; s.story!.pending = 'whale'; tick(s, true); expect(s.events).toHaveLength(0)
  })
  it('keeps an old decision, cooldown and story intact when resuming', () => {
    const s = game(); tick(s, true)
    const saved = decodeRescueSave(encodeRescueSave(s))!, resumed = resumeRescueSolo(saved)
    expect(resumed.story).toEqual(s.story); expect(resumed.captainMode).toBe(true)
    expect(resumed.stations.find(st => st.id === 'starburst')!.cooldown).toBe(8)
    expect(resumed.crew[0]!.seat).toBe('engine'); expect(decodeRescueSave(encodeRescueSave(resumed))).not.toBeNull()
    tick(resumed, true); expect(resumed.events.some(e => e.kind === 'together')).toBe(false)
  })
  it('preserves captain mode at chapter boundaries without changing legacy games', () => {
    const next = restartRescueGame(game(), true)
    expect(isSoloCrossing(next)).toBe(true); expect(next.crew[0]!.seat).toBe('engine')
    const old = createRescueGame(); prepareSoloCrossing(old)
    expect(old.crew[0]!.seat).toBeNull(); expect(old.captainMode).toBeUndefined()
  })
  it('keeps meal support after later harbors, including older saves whose companion departed', () => {
    const s = game(); s.crew = s.crew.filter(c => c.id !== 'pip'); s.campaign.voyages = 10
    prepareSoloCrossing(s)
    const cook = s.crew.find(c => c.seat === 'galley')!
    expect(cook.name).toBe('Pip'); expect(cook.tourEnds).toBe(1e9)
    s.ship.x = s.docks[0]!.x; s.ship.y = s.docks[0]!.y
    applyRescueAction(s, { kind: 'dock' }); expect(s.crew.some(c => c.id === cook.id)).toBe(true)
    expect(decodeRescueSave(encodeRescueSave(s))).not.toBeNull()
  })

  it.each([73599, 20260906, 907])('finishes both story acts from seed %i using only steering, pulse and story choices', seed => {
    let s = game(seed), previous = -1, returning = false, pulses = 0, minimumHp = 12
    const choices = { watch: 'wind', whale: 'channel', 'first-light': 'signal', coat: 'patch', sometimes: 'spoon', 'small-hands': 'read', keeper: 'together', home: 'pass' }
    for (let i = 0; i < 36000 && !s.odyssey?.history.includes('unwritten') && s.phase !== 'lost'; i++) {
      if (s.story?.pending) {
        const encounter = s.story.pending
        applyRescueAction(s, s.story.result ? { kind: 'story-continue', encounter } : { kind: 'story-choice', encounter, choice: choices[encounter] })
        continue
      }
      if (s.odyssey?.pending) { s = applyRescueAction(s, { kind: 'odyssey-continue', encounter: s.odyssey.pending })!; continue }
      if (s.phase === 'won' && !s.odyssey) { s = restartRescueGame(s, true); continue }
      const cage = s.world.cages.find(c => !c.rescued)
      let target = s.world.portal
      if (cage) {
        if (previous !== -1 && previous !== cage.id) returning = true
        previous = cage.id
        if (Math.hypot(s.ship.x, s.ship.y + 24) < 3) returning = false
        target = returning ? { x: 0, y: -24 } : cage
      }
      const dx = target.x - s.ship.x, dy = target.y - s.ship.y, distance = Math.max(.001, Math.hypot(dx, dy)), speed = Math.min(.7, distance * .1)
      const input = { ...neutralRescueInput(i + 1), assist: true, x: dx / distance * speed, y: dy / distance * speed, buttons: i % 2 === 0 ? RESCUE_BUTTON.fire : 0 }
      advanceRescueGame(s, { captain: input }); minimumHp = Math.min(minimumHp, s.ship.hp)
      pulses += Number(s.events.some(e => e.kind === 'together'))
      expect(s.crew.find(c => !c.pet)?.seat).toBe('engine')
    }
    expect({ phase: s.phase, time: s.time, rescued: s.stats.rescues, lesson: s.seamanship?.step, location: [s.ship.x, s.ship.y], story: s.story?.pending, stage: s.odyssey?.stage }).toMatchObject({ phase: 'won', lesson: 5, stage: 'inner' })
    expect(s.story?.history).toHaveLength(8)
    expect(s.odyssey?.history).toEqual(['launch', 'flare', 'gate', 'dragon', 'unwritten'])
    expect(pulses).toBeGreaterThan(5); expect(minimumHp).toBeGreaterThan(0)
    expect(decodeRescueSave(encodeRescueSave(s))).not.toBeNull()
  })
})
