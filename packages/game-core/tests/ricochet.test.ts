import { describe, expect, it } from 'vitest'
import { applyRicochetCommand, availableLenses, availablePayloads, clearRicochetReadiness, createRicochetGame, createRicochetParty,
  finishRicochetShot, restoreRicochetGame, ricochetPreview, ricochetWon, SHOT_LIMIT_MS, simulateRicochet, suggestedRicochetSetup,
  type Lens, type Payload, type RicochetGame } from '../src/ricochet'

const comboGame = (payload: Payload, mode: Lens): RicochetGame => {
  const game = createRicochetGame(1, 4)
  game.rescued = [0, 1, 2]
  game.setup = { aim: Math.atan2(265 - 402, 100) * 180 / Math.PI, payload, reflector: { x: 280, y: 265, angle: -87, mode } }
  return game
}

describe('Ricochet Rescue: literal, deterministic physical combos', () => {
  it('opens with a successful direct shot, then requires a different trajectory', () => {
    const game = createRicochetGame(), shot = simulateRicochet(game)
    expect(shot.rescued).toEqual([0]); expect(shot.transformed).toBe(false)
    const next = finishRicochetShot(game, shot)
    expect(simulateRicochet(next).rescued).toEqual([])
    next.setup = suggestedRicochetSetup(next)
    const rebound = simulateRicochet(next)
    expect(rebound.transformed).toBe(true); expect(rebound.rescued.length).toBeGreaterThan(0)
  })
  it.each([0, 1, 2])('every target in authored scene %i is reachable with the taught controls', scene => {
    let game = createRicochetGame(scene)
    for (let i = 0; i < 25 && !ricochetWon(game); i++) {
      game = { ...game, setup: suggestedRicochetSetup(game) }
      const shot = simulateRicochet(game)
      expect(shot.rescued.length, `scene ${scene}, setup ${JSON.stringify(game.setup)}, rescued ${game.rescued}; events ${JSON.stringify(shot.events)}`).toBeGreaterThan(0)
      game = finishRicochetShot(game, shot)
    }
    expect(ricochetWon(game)).toBe(true)
  })
  it('teaches Burst, then Split, then Focus, then Pierce without locking lives or retries', () => {
    const first = createRicochetGame()
    expect(availablePayloads(first)).toEqual(['plain']); expect(availableLenses(first)).toEqual(['mirror'])
    const second = createRicochetGame(1)
    expect(availablePayloads(second)).toEqual(['plain', 'burst']); expect(availableLenses(second)).toEqual(['mirror'])
    const afterBurst = finishRicochetShot(second)
    expect(afterBurst.rescued.length).toBeGreaterThan(1); expect(availableLenses(afterBurst)).toContain('split')
    const third = createRicochetGame(2, afterBurst.learned)
    expect(availableLenses(third)).toContain('focus'); expect(availablePayloads(third)).not.toContain('pierce')
    expect(availablePayloads(finishRicochetShot(third))).toContain('pierce')
  })
  it.each([['burst', 'split', 'Triple fireworks!'], ['burst', 'focus', 'Supernova splash!'],
    ['pierce', 'split', 'Three-way starbeam!'], ['pierce', 'focus', 'Tidal starbeam!']] as const)('%s + %s produces its actual effect', (payload, mode, name) => {
    const game = comboGame(payload, mode), shot = simulateRicochet(game)
    expect(shot.combo).toBe(name); expect(shot.rescued.length).toBeGreaterThan(0)
    expect(shot.events.filter(event => event.kind === mode)).toHaveLength(1)
    const children = new Set(shot.segments.filter(segment => segment.transformed).map(segment => segment.orb))
    expect(children.size).toBe(mode === 'split' ? 3 : 1)
    if (payload === 'burst') expect(shot.events.some(event => event.kind === 'burst' && event.size === (mode === 'split' ? 31 : 80))).toBe(true)
    if (payload === 'pierce') expect(shot.events.some(event => event.kind === 'burst')).toBe(false)
    expect(simulateRicochet(structuredClone(game))).toEqual(shot)
    expect(new Set(shot.rescued).size).toBe(shot.rescued.length)
    expect(shot.events.map(event => event.at)).toEqual(shot.events.map(event => event.at).sort((a, b) => a - b))
  })
  it('split fireworks rescue three separated groups in one satisfying chain', () => {
    const shot = simulateRicochet(comboGame('burst', 'split'))
    expect(shot.rescued.length).toBeGreaterThanOrEqual(7)
    expect(shot.events.filter(event => event.kind === 'burst')).toHaveLength(3)
  })
  it('a Focus piercing beam reaches an authored line, not just a bigger score', () => {
    const game = createRicochetGame(2, 4), incoming = Math.atan2(275 - 402, 281 - 180) * 180 / Math.PI
    game.setup = { aim: incoming, payload: 'pierce', reflector: { x: 281, y: 275, angle: (incoming - 90) / 2, mode: 'focus' } }
    const shot = simulateRicochet(game)
    expect(shot.rescued.filter(id => id >= 10)).toHaveLength(5)
  })
  it('moving and turning the reflector changes reachable rescues; the same shot alone cannot fake teamwork', () => {
    const game = comboGame('burst', 'split'), good = simulateRicochet(game)
    const moved = structuredClone(game); moved.setup.reflector.y = 310
    const turned = structuredClone(game); turned.setup.reflector.angle = -30
    expect(simulateRicochet(moved).rescued).not.toEqual(good.rescued)
    expect(simulateRicochet(turned).rescued).not.toEqual(good.rescued)
  })
  it('preview is a clipped prefix of the actual paths through the first reflection', () => {
    const game = comboGame('pierce', 'split'), shot = simulateRicochet(game), preview = ricochetPreview(game)
    expect(preview.some(path => path.transformed)).toBe(true)
    for (const path of preview) {
      expect(path.bounces).toBeLessThanOrEqual(1)
      const actual = shot.segments.find(segment => segment.orb === path.orb && segment.start === path.start)!
      expect(actual).toBeDefined(); expect(path.from).toEqual(actual.from)
      const cross = (path.to.x - path.from.x) * (actual.to.y - actual.from.y) - (path.to.y - path.from.y) * (actual.to.x - actual.from.x)
      expect(Math.abs(cross)).toBeLessThan(.0001); expect(path.end).toBeLessThanOrEqual(actual.end)
    }
  })
  it('grazing, corner, repeated-reflector and rapid shots remain finite and bounded', () => {
    for (let i = 0; i < 600; i++) {
      const game = comboGame(i % 2 ? 'pierce' : 'burst', i % 3 ? 'split' : 'focus')
      game.setup.aim = -160 + (i * 17 % 140)
      game.setup.reflector.angle = -180 + (i * 29 % 360)
      const shot = simulateRicochet(game)
      expect(shot.duration).toBeLessThanOrEqual(SHOT_LIMIT_MS + 450)
      expect(new Set(shot.segments.map(segment => segment.orb)).size).toBeLessThanOrEqual(4)
      expect(shot.segments.length).toBeLessThanOrEqual(112)
      expect(JSON.stringify([shot.segments, shot.events])).not.toMatch(/null|NaN|Infinity/)
      expect(shot.events.filter(event => event.kind === 'split')).toHaveLength(shot.events.some(event => event.kind === 'split') ? 1 : 0)
    }
  })
})

describe('Ricochet save isolation and room authority', () => {
  it('round-trips only the new save format and rejects untrusted/invalid shapes', () => {
    const game = comboGame('burst', 'split')
    expect(restoreRicochetGame(JSON.stringify(game))).toEqual(game)
    expect(restoreRicochetGame(JSON.stringify({ version: 1, level: 1, board: [] }))).toBeNull()
    for (const change of [{ scene: -1 }, { scene: 3 }, { learned: 0 }, { rescued: [1, 1] }, { rescued: [999] }, { shots: -1 }, { setup: null }]) {
      expect(restoreRicochetGame(JSON.stringify({ ...game, ...change }))).toBeNull()
    }
    game.setup.reflector.x = 0; expect(restoreRicochetGame(JSON.stringify(game))).toBeNull()
  })
  it('merges simultaneous edits to different jobs and invalidates Ready after either edit', () => {
    let party = createRicochetParty(comboGame('burst', 'split'))
    let result = applyRicochetCommand(party, 0, { kind: 'aim', aim: -60, payload: 'burst', revision: 0 }, 100)
    expect(result.accepted).toBe(true); party = result.party
    result = applyRicochetCommand(party, 1, { kind: 'reflector', reflector: { ...party.game.setup.reflector, angle: -94 }, revision: 0 }, 100)
    expect(result.accepted).toBe(true); party = result.party
    expect(party.game.setup.aim).toBe(-60); expect(party.game.setup.reflector.angle).toBe(-94)
    party = applyRicochetCommand(party, 1, { kind: 'ready', revision: party.revision }, 100).party
    expect(party.ready).toBe(true)
    party = applyRicochetCommand(party, 0, { kind: 'aim', aim: -61, payload: 'burst', revision: party.revision }, 100).party
    expect(party.ready).toBe(false)
    expect(applyRicochetCommand(party, 0, { kind: 'launch', revision: party.revision }, 100).reason).toBe('not-ready')
    expect(applyRicochetCommand(party, 1, { kind: 'ready', revision: 1 }, 100).reason).toBe('stale')
  })
  it('enforces both jobs, server results, one launch, and no edits during flight', () => {
    let party = createRicochetParty(comboGame('burst', 'split'))
    expect(applyRicochetCommand(party, 0, { kind: 'ready', revision: 0 }, 100).reason).toBe('wrong-job')
    expect(applyRicochetCommand(party, 1, { kind: 'aim', aim: -90, payload: 'burst', revision: 0 }, 100).reason).toBe('wrong-job')
    party = applyRicochetCommand(party, 1, { kind: 'ready', revision: 0 }, 100).party
    const oldRevision = party.revision, shot = simulateRicochet(party.game)
    party = applyRicochetCommand(party, 0, { kind: 'launch', revision: oldRevision }, 100).party
    expect(party.playback!.shot).toEqual(shot); expect(party.game.shots).toBe(1)
    expect(party.game.rescued).toEqual([...new Set([0, 1, 2, ...shot.rescued])].sort((a, b) => a - b))
    expect(applyRicochetCommand(party, 0, { kind: 'launch', revision: oldRevision }, 100).reason).toBe('busy')
    expect(applyRicochetCommand(party, 1, { kind: 'reflector', reflector: party.game.setup.reflector, revision: party.revision }, 100).reason).toBe('busy')
  })
  it('disconnect clears consent; role swapping and new scenes invalidate previous layouts', () => {
    let party = createRicochetParty()
    expect(applyRicochetCommand(party, 1, { kind: 'ready', revision: 0 }, 0, [true, false]).reason).toBe('partner-away')
    party = applyRicochetCommand(party, 1, { kind: 'ready', revision: 0 }, 0).party
    party = clearRicochetReadiness(party); expect(party.ready).toBe(false)
    const revision = party.revision
    party = applyRicochetCommand(party, 0, { kind: 'swap-jobs', revision }, 0).party
    expect(party.launcher).toBe(1)
    expect(applyRicochetCommand(party, 1, { kind: 'aim', aim: -90, payload: 'plain', revision }, 0).reason).toBe('stale')
    expect(applyRicochetCommand(party, 0, { kind: 'next', revision: party.revision }, 0).reason).toBe('unavailable')
    party = applyRicochetCommand(party, 0, { kind: 'retry', revision: party.revision }, 0).party
    expect(party.launcher).toBe(1); expect(party.game.shots).toBe(0)
  })
})
